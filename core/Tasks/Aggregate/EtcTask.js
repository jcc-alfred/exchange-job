let schedule = require('node-schedule');
let fs= require('fs');
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

try{
    
    var rule = new schedule.RecurrenceRule();
    var times = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    rule.hour  = times; 
    rule.minute = 0;

    let isRun = false;
    var job = schedule.scheduleJob(rule,async()=>{
        
        if(isRun){
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if(!coinList){
            isRun = false;
            return;
        }
        let [ethCoin] = coinList.filter(coin => coin.coin_api_type_id == 2 && coin.coin_id == 7);
        if(!ethCoin || !ethCoin.wallet_ip){
            isRun = false;
            return;
        }
        //ETH汇总
        try{
            let eth_ethService = new EthService(ethCoin.wallet_ip,ethCoin.wallet_port,ethCoin.wallet_passphrase);
            let eth_userCount = await AssetsModel.getUserNoEmptyAssetsCountByCoinId(ethCoin.coin_id);
            let eth_pageSize = 500;
            let eth_pageCount = Math.ceil(eth_userCount / eth_pageSize);
            let eth_userETHBalanceList = [];//所有用户ETH余额信息
            let eth_gasPrice = await eth_ethService.getGasPrice();
            let transferETHFees = eth_ethService.weiToEther(eth_gasPrice * 21000);
            for(let page = 1; page <= eth_pageCount; page++){
                let assetsList = await AssetsModel.getNoEmptyAssetsByCoinId(ethCoin.coin_id,page,eth_pageSize);
                if(!assetsList|| !assetsList.list || !assetsList.list.length){
                    return;
                }
                await Promise.all(assetsList.list.map(async(item)=>{
                   let balanceWei = await eth_ethService.getBalance(item.block_address);
                   let balance = eth_ethService.weiToEther(balanceWei);
                   if(balance == 0 || balance < ethCoin.min_aggregate_amount){
                       return;
                   }
                   eth_userETHBalanceList.push({block_address:item.block_address,private_key:item.private_key,eth_balance:balance});
                   return;
                }));
            }
            await Promise.all(eth_userETHBalanceList.map(async(userETHBalance)=>{
                let privateKey = CryptoUtils.aesDecode(userETHBalance.private_key);
                let trade_amount = Utils.sub(userETHBalance.eth_balance , transferETHFees);
                if(trade_amount > 0){
                    let txObj = await eth_ethService.sendSignedTransaction(ethCoin.main_block_address,trade_amount,privateKey);
                    if(txObj && txObj.transactionHash){
                        // 增加汇总记录
                        let res = await CoinAggregateModel.addCoinAggregate(txObj.transactionHash,ethCoin.coin_id,userETHBalance.block_address,ethCoin.main_block_address,trade_amount,'汇总ETC');
                        //写入系统手续费表
                        TransferFeesLogModel.addTransferFees(ethCoin.coin_id,txObj.transactionHash,ethCoin.coin_id,transferETHFees,'汇总ETC手续费');
                        console.log(txObj.transactionHash,trade_amount);
                    }
                }
                return;
            }));
        }catch(error){
            console.error(error);
        }
        isRun = false;
    }); 
}catch(error){
    isRun = false;
    throw error;
}


