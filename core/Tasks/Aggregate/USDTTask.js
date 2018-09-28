let schedule = require('node-schedule');
let fs= require('fs');
let _ = require('lodash');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let USDTService = require('../../Base/Crypto/USDTService');
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
        let [usdtCoin] = coinList.filter(coin => coin.coin_api_type_id == 4);
        if(!usdtCoin || !usdtCoin.wallet_ip){
            isRun = false;
            return;
        }
        //USDT汇总
        try{
            let usdtService = new USDTService(usdtCoin.wallet_ip,usdtCoin.wallet_port,usdtCoin.wallet_rpc_user,usdtCoin.wallet_rpc_pass,usdtCoin.wallet_passphrase);
            let userCount = await AssetsModel.getUserNoEmptyAssetsCountByCoinId(usdtCoin.coin_id);
            let pageSize = 500;
            let pageCount = Math.ceil(userCount / pageSize);
            let userBalanceList = [];//所有用户BTC USDT余额信息 有BTC
            let userBalanceList_NoneBTC = [];//所有用户BTC USDT余额信息 没有BTC
            for(let page = 1; page <= pageCount; page++){
                let assetsList = await AssetsModel.getNoEmptyAssetsByCoinId(ethCoin.coin_id,page,pageSize);
                if(!assetsList|| !assetsList.list || !assetsList.list.length){
                    return;
                }
                await Promise.all(assetsList.list.map(async(item)=>{
                   let btc_balance = await usdtService.getBTCBalanceByAddress(item.block_address);
                   let usdt_balance = await usdtService.omniGetBalance(item.block_address);
                   if(usdtCoin.min_aggregate_amount > 0 && usdt_balance >= usdtCoin.min_aggregate_amount){
                       if(btc_balance > 0){
                            userBalanceList.push({block_address:item.block_address,btc_balance:btc_balance,usdt_balance:usdt_balance});
                       }else{
                            userBalanceList_NoneBTC.push({block_address:item.block_address,btc_balance:btc_balance,usdt_balance:usdt_balance});
                       }
                        
                   }
                   return;
                }));
            }
            if(usdtCoin.wallet_passphrase){
                await usdtService.WalletLock();
                await usdtService.walletPassphrase();
            }
            let aggregateFees = 0.0005;
            await Promise.all(userBalanceList.map(async(userBalance)=>{
                let to_block_address = usdtService.main_block_address;
                let trade_amount = userBalance.usdt_balance;
                if(userBalance.btc_balance < aggregateFees){
                    userBalanceList_NoneBTC.push(userBalance);
                    break;
                }else{
                    let [txid] = await usdtService.omniSend(userBalance.block_address,to_block_address,trade_amount);
                    if(txid && txid != '' && !txid.hasOwnProperty('code')){
                        // 增加汇总记录
                        let res = await CoinAggregateModel.addCoinAggregate(txid,usdtCoin.coin_id,userBalance.block_address,to_block_address,trade_amount,'汇总USDT');
                        console.log(txid,trade_amount);
                        //写入系统手续费表
                        let bitcoinId = 1;
                        TransferFeesLogModel.addTransferFees(usdtCoin.coin_id,txid,bitcoinId,aggregateFees,'汇总USDT');
                    }
                }
                return;
            }));
            await Promise.all(userBalanceList_NoneBTC.map(async(userBalance)=>{
                let btcMainBalance = await usdtService.getBTCBalanceByAddress(usdtCoin.main_block_address);
                let to_block_address = usdtCoin.main_block_address;
                let trade_amount = userBalance.usdt_balance;
                let transferBTCFees = 0.0005;
                let estAmount = Utils.add(aggregateFees,transferBTCFees);
                if(btcMainBalance < estAmount){
                    console.error('btcMainBalance:' + btcMainBalance + ' estAmount:' + estAmount);
                    break;
                }
                let [txid] = await usdtService.sendToAddress(userBalance.block_address,aggregateFees);
                if(txid && txid != '' && !txid.hasOwnProperty('code')){
                    let bitcoinId = 1;
                    // 增加汇总记录
                    let res = await CoinAggregateModel.addCoinAggregate(txid,bitcoinId,usdtCoin.main_block_address,userBalance.block_address,aggregateFees,'汇总USDT 发送BTC手续费');
                    //写入系统手续费表
                    TransferFeesLogModel.addTransferFees(bitcoinId,txid,bitcoinId,transferBTCFees,'汇总USDT 发送BTC手续费');
                    console.log(txid,transferBTCFees);
                }
                return;
            }));
            if(usdtCoin.wallet_passphrase){
                usdtService.WalletLock();
            }
        }catch(error){
            console.error(error);
        }
        isRun = false;
    }); 
}catch(error){
    isRun = false;
    throw error;
}


