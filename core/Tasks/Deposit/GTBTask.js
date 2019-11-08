let schedule = require('node-schedule');
let fs = require('fs');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let EthService = require('../../Base/Crypto/EthService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
let DepositModel = require('../../Model/DepositModel');
let CoinAggregateModel = require('../../Model/CoinAggregateModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
const abiDecoder = require('abi-decoder');
let contractABI = require('../../Base/Crypto/ABI');
abiDecoder.addABI(contractABI);
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
    let isRun = false;
    var job = schedule.scheduleJob('1 * * * * *', async () => {
        if (isRun) {
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if (!coinList) {
            isRun = false;
            return;
        }
        // GTB(6)
        // GTB ERC 20(7)
        let [ethCoin] = coinList.filter(coin => coin.coin_api_type_id == 6 && coin.coin_id == 8);
        let erc20List = coinList.filter(coin => coin.coin_api_type_id == 7);
        if (!ethCoin) {
            isRun = false;
            return;
        }
        try {
            let lastProcBlockNum = fs.readFileSync(__dirname + '/GTBBlockNumber', {encoding: 'utf-8', flag: 'r'});
            console.log('lastProcBlockNum', lastProcBlockNum);
            let ethService = new EthService(ethCoin.wallet_ip, ethCoin.wallet_port, ethCoin.wallet_passphrase);
            let currenctBlockNum = await ethService.getBlockNumber();
            console.log('******currenctBlockNum:' + currenctBlockNum);
            if (parseInt(currenctBlockNum) >= parseInt(lastProcBlockNum)) {
                for (var blockNum = parseInt(lastProcBlockNum) + 1; blockNum <= currenctBlockNum; blockNum++) {
                    let block = await ethService.getBlock(blockNum);
                    if (block == null || block.transactions == null) {
                        isRun = false;
                        return;
                    }
                    let transList = await Promise.all(block.transactions.map(async (txid) => {
                        return await ethService.getTransaction(txid);
                    }));
                    console.log('ProcNumber:' + blockNum, '---transList:' + transList.length);
                    //eth的充值记录 - txObj.to 是否为用户资产地址
                    let blockAddrList = [];
                    transList.forEach((tx) => {
                        if (tx && tx.to) {
                            blockAddrList.push(tx.to);
                        }
                    });
                    if (blockAddrList && blockAddrList.length > 0) {
                        let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(blockAddrList, ethCoin.coin_id);
                        let ethTxList = [];
                        transList.forEach((tx) => {
                            if (tx && tx.to) {
                                let [userAssetsItem] = userAssetsList.filter((userAssetsItem) => userAssetsItem.block_address.toLowerCase() == tx.to.toLowerCase());
                                if (userAssetsItem && userAssetsItem.block_address) {
                                    ethTxList.push({txObj: tx, userAssets: userAssetsItem});
                                }
                            }
                        });

                        if (ethTxList && ethTxList.length > 0) {
                            let w1 = await Promise.all(ethTxList.map(async (userTxObj) => {
                                if (!userTxObj) {
                                    return;
                                }
                                try {
                                    let txid = userTxObj.txObj.hash;
                                    let confirmCount = ethCoin.confirm_count > 0 ? ethCoin.confirm_count : 12;
                                    let amount = Utils.checkDecimal(ethService.weiToEther(userTxObj.txObj.value), ethCoin.decimal_digits);
                                    console.log(userTxObj.txObj.hash, amount);
                                    let confirmations = currenctBlockNum - blockNum;
                                    let [depositItem] = await DepositModel.getUserDepositByTxId(txid);
                                    let coinAggItem = await CoinAggregateModel.getCoinAggregateByTxId(txid);
                                    //确认充值记录状态和是否为聚合汇总记录
                                    let confirmStatus = -1;// 0 未确认 1 充值成功 2 充值失败 4 聚合汇总
                                    if (depositItem && depositItem.confirm_status >= 0) {
                                        confirmStatus = depositItem.confirm_status;
                                    }
                                    if (coinAggItem && coinAggItem.length > 0) {
                                        confirmStatus = 4;
                                    }
                                    if (confirmStatus >= 0) {

                                    }
                                    else {
                                        let userId = userTxObj.userAssets.user_id;
                                        let coinId = ethCoin.coin_id;
                                        let fromBlockAddr = userTxObj.txObj.from;
                                        let toBlockAddr = userTxObj.txObj.to;
                                        confirmStatus = confirmations >= confirmCount ? 1 : 0;
                                        //新增充值记录
                                        let res = await DepositModel.addUserDesposit(userId, coinId, txid, fromBlockAddr, toBlockAddr, amount, confirmations);
                                        if (res.affectedRows && confirmStatus == 1) {
                                            //确认充值
                                            let res = await DepositModel.confirmDeposit(txid, confirmations);
                                            if (res) {
                                                //发送通知
                                                UserModel.sendAlert(
                                                    userId,
                                                    UserAlertModel.alertTypeMap.payIn,
                                                    'en-us',
                                                    amount,
                                                    ethCoin.coin_unit
                                                );
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error(error);
                                }

                            }));
                        }
                    }

                    if (erc20List && erc20List.length > 0) {
                        //erc20代币的充值记录 - txObj.to 是否为合约地址
                        let erc20TxList = transList.filter((tx) => (
                            erc20List.find((erc20) => {
                                    if (erc20.contract_address && tx.to && erc20.contract_address && erc20.contract_address.toLowerCase() == tx.to.toLowerCase()) {
                                        return true;
                                    } else {
                                        return false;
                                    }
                                }
                            )));
                        if (erc20TxList && erc20TxList.length > 0) {
                            let w1 = await Promise.all(erc20TxList.map(async (txObj) => {
                                if (!txObj || !txObj.input || txObj.input.length != 138) {
                                    return;
                                }
                                let methodId = txObj.input.substring(0, 10).toLowerCase();
                                if (methodId == '0xa9059cbb') {
                                    try {
                                        let txid = txObj.hash;
                                        let result = abiDecoder.decodeMethod(txObj.input);
                                        let toBlockAddr = result.params.find(i => i.name === '_to').value;
                                        // let toBlockAddr = "0x" + txObj.input.substring(34, 74);
                                        // if(toBlockAddr =='0x94b64d8e3ff1a5a1822419a6a08d5c92508dc904'){
                                        //     console.log(txObj);
                                        // }
                                        // let amountHex = txObj.input.substring(74, 138);
                                        let [erc20Coin] = coinList.filter(coin => coin.contract_address.toLowerCase() == txObj.to.toLowerCase());
                                        let confirmCount = erc20Coin.confirm_count > 0 ? erc20Coin.confirm_count : 12;
                                        let weiUnit = Math.pow(10, erc20Coin.token_decimals);
                                        let amount256 = result.params.find(i => i.name === '_value').value;
                                        let amount = Utils.checkDecimal(Utils.div(amount256, weiUnit), erc20Coin.decimal_digits);
                                        console.log(txid, amount);
                                        let [userAssetsItem] = await AssetsModel.getUserAssetsByBlockAddrListCoinId(toBlockAddr, erc20Coin.coin_id);
                                        if (userAssetsItem && userAssetsItem.user_id) {
                                            let confirmations = currenctBlockNum - blockNum;
                                            let [depositItem] = await DepositModel.getUserDepositByTxId(txid);
                                            let coinAggItem = await CoinAggregateModel.getCoinAggregateByTxId(txid);
                                            //确认充值记录状态和是否为聚合汇总记录
                                            let confirmStatus = -1;// 0 未确认 1 充值成功 2 充值失败 4 聚合汇总
                                            if (depositItem && depositItem.confirm_status >= 0) {
                                                confirmStatus = depositItem.confirm_status;
                                            }
                                            if (coinAggItem && coinAggItem.length > 0) {
                                                confirmStatus = 4;
                                            }
                                            if (confirmStatus >= 0) {

                                            }
                                            else {
                                                let userId = userAssetsItem.user_id;
                                                let coinId = erc20Coin.coin_id;

                                                let fromBlockAddr = txObj.from;
                                                confirmStatus = confirmations >= confirmCount ? 1 : 0;
                                                //新增充值记录
                                                let res = await DepositModel.addUserDesposit(userId, coinId, txid, fromBlockAddr, toBlockAddr, amount, confirmations);
                                                //确认充值
                                                if (res.affectedRows && confirmStatus == 1) {
                                                    //确认充值
                                                    let res = await DepositModel.confirmDeposit(txid, confirmations);
                                                    if (res) {
                                                        //发送通知
                                                        UserModel.sendAlert(
                                                            userId,
                                                            UserAlertModel.alertTypeMap.payIn,
                                                            'en-us',
                                                            amount,
                                                            erc20Coin.coin_unit
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.error(error);
                                    }
                                }

                            }));
                        }
                    }

                    fs.writeFileSync(__dirname + '/GTBBlockNumber', blockNum, {encoding: 'utf-8', flag: 'w'});
                }
            }
            //处理ETH未确认记录
            try {
                let unConfirmEthList = await DepositModel.getUnConfirmDepositListByCoinIdList(ethCoin.coin_id);
                if (unConfirmEthList && unConfirmEthList.length > 0) {
                    let transList = await Promise.all(unConfirmEthList.map(async (depositItem) => {
                        let txObj = await ethService.getTransaction(depositItem.txid);
                        if (txObj && txObj.blockNumber) {
                            let confirmCount = ethCoin.confirm_count > 0 ? ethCoin.confirm_count : 12;
                            let amount = Utils.checkDecimal(ethService.weiToEther(txObj.value), ethCoin.decimal_digits);
                            let confirmations = currenctBlockNum - txObj.blockNumber;
                            //确认充值记录状态
                            let userId = depositItem.user_id;
                            let txid = depositItem.txid;
                            let confirmStatus = confirmations >= confirmCount ? 1 : 0;
                            if (confirmStatus == 1) {
                                //确认充值
                                let res = await DepositModel.confirmDeposit(txid, confirmations);
                                if (res) {
                                    //发送通知
                                    UserModel.sendAlert(
                                        userId,
                                        UserAlertModel.alertTypeMap.payIn,
                                        'en-us',
                                        amount,
                                        ethCoin.coin_unit
                                    );
                                }
                            }
                        }
                    }));
                }
            } catch (error) {
                console.error(error);
            }
            //处理ERC20代币未确认记录
            try {
                erc20CoinIdList = erc20List.map((erc20Coin) => {
                    return erc20Coin.coin_id;
                });
                let unConfirmERC20List = await DepositModel.getUnConfirmDepositListByCoinIdList(erc20CoinIdList);
                if (unConfirmERC20List && unConfirmERC20List.length > 0) {
                    let transList = await Promise.all(unConfirmERC20List.map(async (depositItem) => {
                        let txObj = await ethService.getTransaction(depositItem.txid);
                        if (txObj && txObj.input && txObj.input.length == 138) {
                            let methodId = txObj.input.substring(0, 10).toLowerCase();
                            if (methodId == '0xa9059cbb') {
                                let toBlockAddr = "0x" + txObj.input.substring(34, 74);
                                let amountHex = txObj.input.substring(74, 138);
                                let [erc20Coin] = coinList.filter(coin => coin.contract_address.toLowerCase() == txObj.to.toLowerCase());
                                let confirmCount = erc20Coin.confirm_count > 0 ? erc20Coin.confirm_count : 12;
                                let weiUnit = Math.pow(10, erc20Coin.token_decimals);
                                let amount = Utils.checkDecimal(Utils.div(ethService.hexToNumber(amountHex), weiUnit), erc20Coin.decimal_digits);
                                let confirmations = currenctBlockNum - txObj.blockNumber;
                                let confirmStatus = confirmations >= confirmCount ? 1 : 0;
                                if (confirmStatus == 1) {
                                    let userId = depositItem.user_id;
                                    let txid = depositItem.txid;
                                    //确认充值
                                    let res = await DepositModel.confirmDeposit(txid, confirmations);
                                    if (res) {
                                        //发送通知
                                        UserModel.sendAlert(
                                            userId,
                                            UserAlertModel.alertTypeMap.payIn,
                                            'en-us',
                                            amount,
                                            erc20Coin.coin_unit
                                        );
                                    }
                                }
                            }
                        }

                    }));
                }
            } catch (error) {
                console.error(error);
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
        isRun = false;
    });
} catch (error) {
    isRun = false;
    console.error(error);
}


