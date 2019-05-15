let schedule = require('node-schedule');
let fs = require('fs');
let _ = require('lodash');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let EthService = require('../../Base/Crypto/EthService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
let WithdrawModel = require('../../Model/WithdrawModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
let CoinAggregateModel = require('../../Model/CoinAggregateModel');
let TransferFeesLogModel = require('../../Model/TransferFeesLogModel');

// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)

try {
    var rule = new schedule.RecurrenceRule();
    var times = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    rule.hour = times;
    rule.minute = 0;

    let isRun = false;
    var job = schedule.scheduleJob(rule, async () => {

        if (isRun) {
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if (!coinList) {
            isRun = false;
            return;
        }
        let [ethCoin] = coinList.filter(coin => coin.coin_api_type_id == 6 && coin.coin_id == 8);
        if (!ethCoin || !ethCoin.wallet_ip) {
            isRun = false;
            return;
        }
        //ERC20汇总
        try {
            let erc20List = coinList.filter(coin => coin.coin_api_type_id == 7);
            if (!erc20List || erc20List.length <= 0) {
                isRun = false;
                return;
            }
            let ethService = new EthService(ethCoin.wallet_ip, ethCoin.wallet_port, ethCoin.wallet_passphrase);
            let userCount = await AssetsModel.getUserNoEmptyAssetsCountByCoinId(ethCoin.coin_id);
            let pageSize = 500;
            let pageCount = Math.ceil(userCount / pageSize);
            let userETHBalanceList = [];//所有用户ETH余额信息
            for (let page = 1; page <= pageCount; page++) {
                let assetsList = await AssetsModel.getNoEmptyAssetsByCoinId(ethCoin.coin_id, page, pageSize);
                if (!assetsList || !assetsList.list || !assetsList.list.length) {
                    return;
                }
                await Promise.all(assetsList.list.map(async (item) => {
                    let balanceWei = await ethService.getBalance(item.block_address);
                    let balance = ethService.weiToEther(balanceWei);
                    userETHBalanceList.push({
                        block_address: item.block_address,
                        private_key: item.private_key,
                        eth_balance: balance
                    });

                }));
            }
            if (userETHBalanceList.length>100){
                userETHBalanceList=userETHBalanceList.slice(0,100)
            }

            let userERC20BalanceList = [];//需要汇总ERC20的列表有eth余额
            let userERC20BalanceList_NoneETH = [];//需要汇总ERC20的列表没有eth余额
            await Promise.all(userETHBalanceList.map(async (userETHBalance) => {
                let erc20BalanceList = [];
                await Promise.all(erc20List.map(async (coin) => {
                    if (!coin.main_block_address || userETHBalance.block_address.toLowerCase() == coin.main_block_address.toLowerCase()) {
                        return;
                    }
                    let erc20Service = new EthService(coin.wallet_ip, coin.wallet_port, coin.wallet_passphrase);
                    let balanceWei = await erc20Service.getTokenBalance(userETHBalance.block_address, coin.contract_address);
                    let balance = balanceWei / Math.pow(10, coin.token_decimals);
                    // let min_aggregate_amount = coin.min_aggregate_amount * Math.pow(10,coin.token_decimals);
                    if (coin.min_aggregate_amount > 0 && balance >= coin.min_aggregate_amount) {
                        erc20BalanceList.push({erc20Coin: coin, balance: balance});
                    }

                }));
                if (userETHBalance.eth_balance > 0 && erc20BalanceList.length > 0) {
                    userERC20BalanceList.push({...userETHBalance, erc20List: erc20BalanceList});
                } else if (erc20BalanceList.length > 0) {
                    userERC20BalanceList_NoneETH.push({...userETHBalance, erc20List: erc20BalanceList});
                }

            }));
            let gasPrice = await ethService.getGasPrice();
            await Promise.all(userERC20BalanceList.map(async (userERC20Balance) => {
                let privateKey = CryptoUtils.aesDecode(userERC20Balance.private_key);
                for (let erc20Balance of userERC20Balance.erc20List) {
                    let to_block_address = erc20Balance.erc20Coin.main_block_address;
                    let trade_amount = erc20Balance.balance;
                    let contract_address = erc20Balance.erc20Coin.contract_address;
                    let token_decimals = erc20Balance.erc20Coin.token_decimals;
                    let estimateGas = await ethService.getTokenEstimateGas(to_block_address, trade_amount, privateKey, contract_address, token_decimals);
                    let fees = ethService.weiToEther(estimateGas * gasPrice);
                    if (userERC20Balance.eth_balance < fees) {
                        userERC20BalanceList_NoneETH.push(userERC20Balance);
                        break;
                    } else {
                        let txObj = await ethService.sendTokenSignedTransaction(to_block_address, trade_amount, privateKey, contract_address, token_decimals);
                        if (txObj && txObj.transactionHash) {
                            // 增加汇总记录
                            let res = await CoinAggregateModel.addCoinAggregate(txObj.transactionHash, erc20Balance.erc20Coin.coin_id, userERC20Balance.block_address, to_block_address, trade_amount, '汇总ERC20');
                            console.log(txObj.transactionHash, trade_amount);
                            //写入系统手续费表
                            let fees = ethService.weiToEther(txObj.gasUsed * gasPrice);
                            TransferFeesLogModel.addTransferFees(erc20Balance.erc20Coin.coin_id, txObj.transactionHash, ethCoin.coin_id, fees, '汇总ERC20');
                        }
                    }

                }

            }));
            let ethPrivateKey = CryptoUtils.aesDecode(ethCoin.main_block_address_private_key);
            await Promise.all(userERC20BalanceList_NoneETH.map(async (userERC20Balance) => {
                let privateKey = CryptoUtils.aesDecode(userERC20Balance.private_key);
                for (let erc20Balance of userERC20Balance.erc20List) {
                    let ethMainBalance = await ethService.getBalance(ethCoin.main_block_address);
                    let to_block_address = erc20Balance.erc20Coin.main_block_address;
                    let trade_amount = erc20Balance.balance;
                    let contract_address = erc20Balance.erc20Coin.contract_address;
                    let token_decimals = erc20Balance.erc20Coin.token_decimals;
                    let estimateGas = await ethService.getTokenEstimateGas(to_block_address, trade_amount, privateKey, contract_address, token_decimals);
                    let aggregateFees = ethService.weiToEther(estimateGas * gasPrice);
                    let transferETHFees = ethService.weiToEther(gasPrice * 21000);
                    let estAmount = Utils.add(aggregateFees, transferETHFees);
                    if (ethMainBalance < estAmount) {
                        console.error('ethMainBalance:' + ethMainBalance + ' estAmount:' + estAmount);
                        break;
                    }
                    let txObj = await ethService.sendSignedTransaction(userERC20Balance.block_address, aggregateFees, ethPrivateKey);
                    if (txObj && txObj.transactionHash) {
                        // 增加汇总记录
                        let res = await CoinAggregateModel.addCoinAggregate(txObj.transactionHash, ethCoin.coin_id, ethCoin.main_block_address, userERC20Balance.block_address, aggregateFees, '汇总ERC20 发送ETH手续费');
                        //写入系统手续费表
                        TransferFeesLogModel.addTransferFees(ethCoin.coin_id, txObj.transactionHash, ethCoin.coin_id, transferETHFees, '汇总ERC20 发送ETH手续费');
                        console.log(txObj.transactionHash, transferETHFees);
                    }
                }

            }));
        } catch (error) {
            console.error(error);
        }
        //ETH汇总
        try {
            let eth_ethService = new EthService(ethCoin.wallet_ip, ethCoin.wallet_port, ethCoin.wallet_passphrase);
            let eth_userCount = await AssetsModel.getUserNoEmptyAssetsCountByCoinId(ethCoin.coin_id);
            let eth_pageSize = 500;
            let eth_pageCount = Math.ceil(eth_userCount / eth_pageSize);
            let eth_userETHBalanceList = [];//所有用户ETH余额信息
            let eth_gasPrice = await eth_ethService.getGasPrice();
            let transferETHFees = eth_ethService.weiToEther(eth_gasPrice * 21000);
            for (let page = 1; page <= eth_pageCount; page++) {
                let assetsList = await AssetsModel.getNoEmptyAssetsByCoinId(ethCoin.coin_id, page, eth_pageSize);
                if (!assetsList || !assetsList.list || !assetsList.list.length) {
                    return;
                }
                await Promise.all(assetsList.list.map(async (item) => {
                    let balanceWei = await eth_ethService.getBalance(item.block_address);
                    let balance = eth_ethService.weiToEther(balanceWei);
                    if (balance == 0 || balance < ethCoin.min_aggregate_amount) {
                        return;
                    }
                    eth_userETHBalanceList.push({
                        block_address: item.block_address,
                        private_key: item.private_key,
                        eth_balance: balance
                    });

                }));
            }
            await Promise.all(eth_userETHBalanceList.map(async (userETHBalance) => {
                let privateKey = CryptoUtils.aesDecode(userETHBalance.private_key);
                let trade_amount = Utils.sub(userETHBalance.eth_balance, transferETHFees);
                if (trade_amount > 0) {
                    let txObj = await eth_ethService.sendSignedTransaction(ethCoin.main_block_address, trade_amount, privateKey);
                    if (txObj && txObj.transactionHash) {
                        // 增加汇总记录
                        let res = await CoinAggregateModel.addCoinAggregate(txObj.transactionHash, ethCoin.coin_id, userETHBalance.block_address, ethCoin.main_block_address, trade_amount, '汇总ETH');
                        //写入系统手续费表
                        TransferFeesLogModel.addTransferFees(ethCoin.coin_id, txObj.transactionHash, ethCoin.coin_id, transferETHFees, '汇总ETH手续费');
                        console.log(txObj.transactionHash, trade_amount);
                    }
                }

            }));
        } catch (error) {
            console.error(error);
        }
        isRun = false;
    });
} catch (error) {
    isRun = false;
    console.error(error);
}


