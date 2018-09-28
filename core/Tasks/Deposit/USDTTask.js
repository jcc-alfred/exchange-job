let schedule = require('node-schedule');
let fs= require('fs');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let USDTService = require('../../Base/Crypto/USDTService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
let DepositModel = require('../../Model/DepositModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
let CoinAggregateModel = require('../../Model/CoinAggregateModel');
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
    let isRun = false;
    var job = schedule.scheduleJob('5 * * * * *',async()=>{
        
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
        if(!usdtCoin){
            isRun = false;
            return;
        }
        if(!usdtCoin.wallet_ip){
            isRun = false;
            return;
        }
        try{
            let usdtService = new USDTService(usdtCoin.wallet_ip,usdtCoin.wallet_port,usdtCoin.wallet_rpc_user,usdtCoin.wallet_rpc_pass,usdtCoin.wallet_passphrase);
            let [transList] = await usdtService.omniListTransactions();
            if(transList && Array.isArray(transList) && transList.length > 0){
                usdtTransList = transList.filter((tx)=>tx.propertyid == '2');
                let txidList = [];
                usdtTransList.forEach((tx)=>{
                    if(tx && tx.txid && tx.amount > 0 && tx.confirmations > 0 && tx.valid == true){
                        txidList.push(tx.txid);
                    }
                });
                if(txidList && txidList.length > 0){
                    let depositList = await DepositModel.getDepositListByTxIdList(txidList);
                    let unProcTxList = [];
                    let blockAddrList = [];
                    usdtTransList.forEach((tx)=>{
                        if(tx && tx.txid && tx.amount > 0 && tx.confirmations > 0 && tx.valid == true){
                            if(!depositList.find((depositItem)=>depositItem.txid.toLowerCase() == tx.txid.toLowerCase())){
                                unProcTxList.push(tx);
                                blockAddrList.push(tx.referenceaddress);
                            }
                        }
                    });
                    let usdtTxList = [];
                    if(unProcTxList && unProcTxList.length > 0){
                        let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(blockAddrList,usdtCoin.coin_id);
                        unProcTxList.forEach((tx)=>{
                            let [userAssetsItem] = userAssetsList.filter((userAssetsItem)=> userAssetsItem.block_address.toLowerCase() == tx.referenceaddress.toLowerCase());
                            if(userAssetsItem && userAssetsItem.block_address){
                                usdtTxList.push({txObj:tx,userAssets:userAssetsItem}); 
                            }
                        })
                    }
                    if(usdtTxList && usdtTxList.length > 0){
                        let w1 = await Promise.all(usdtTxList.map(async(userTxObj)=>{
                            if(!userTxObj){
                                return;
                            }
                            try{
                                let txid = userTxObj.txObj.txid;
                                let confirmCount = usdtCoin.confirm_count > 0 ? usdtCoin.confirm_count : 2;
                                let amount = Utils.checkDecimal(userTxObj.txObj.amount,usdtCoin.decimal_digits);
                                console.log(userTxObj.txObj.txid,amount)
                                let confirmations = userTxObj.txObj.confirmations;
                                 //确认充值记录状态和是否为聚合汇总记录
                                let coinAggItem = await CoinAggregateModel.getCoinAggregateByTxId(txid);
                                let confirmStatus = confirmations >= confirmCount ? 1 : 0;// 0 未确认 1 充值成功 2 充值失败 4 聚合汇总
                                if(coinAggItem && coinAggItem.length > 0){
                                    //confirmStatus = 4;
                                    return;
                                }
                                let userId = userTxObj.userAssets.user_id;
                                let coinId = usdtCoin.coin_id;
                                let fromBlockAddr = '';
                                let toBlockAddr = userTxObj.txObj.referenceaddress;

                                //新增充值记录
                                let res = await DepositModel.addUserDesposit(userId,coinId,txid,fromBlockAddr,toBlockAddr,amount,confirmations);
                                if(res.affectedRows && confirmStatus == 1){
                                    //确认充值
                                    let res = await DepositModel.confirmDeposit(txid,confirmations);
                                    if(res){
                                        //发送通知
                                        UserModel.sendAlert(
                                            userId,
                                            UserAlertModel.alertTypeMap.payIn,
                                            'en-us',
                                            amount,
                                            usdtCoin.coin_unit
                                        );
                                    }
                                }
                            }catch(error){
                                console.error(error);
                            }
                            return;
                        }));
                    }
                }
            }
            
        }catch(error){
            console.error(error);
        }

        //处理USDT未确认记录
        try{
            let usdtService = new USDTService(usdtCoin.wallet_ip,usdtCoin.wallet_port,usdtCoin.wallet_rpc_user,usdtCoin.wallet_rpc_pass,usdtCoin.wallet_passphrase);
            let unConfirmList = await DepositModel.getUnConfirmDepositListByCoinIdList(usdtCoin.coin_id);
           
            if(unConfirmList && unConfirmList.length > 0){
                let transList = await Promise.all(unConfirmList.map(async(depositItem)=>{
                    let [txObj] = await usdtService.omniGetTransaction(depositItem.txid);
                    if(txObj && txObj.txid && txObj.valid == true){
                        let confirmCount = usdtCoin.confirm_count > 0 ? usdtCoin.confirm_count : 2;
                        let amount = Utils.checkDecimal(txObj.amount,usdtCoin.decimal_digits);
                        let confirmations = txObj.confirmations;
                        //确认充值记录状态
                        let userId = depositItem.user_id;
                        let txid = depositItem.txid;
                        let confirmStatus = confirmations >= confirmCount ? 1 : 0;
                        if(confirmStatus == 1){
                            //确认充值
                            let res = await DepositModel.confirmDeposit(txid,confirmations);
                            if(res){
                                //发送通知
                                UserModel.sendAlert(
                                    userId,
                                    UserAlertModel.alertTypeMap.payIn,
                                    'en-us',
                                    amount,
                                    usdtCoin.coin_unit
                                );
                            }
                        }
                    }
                    return;
                }));
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


