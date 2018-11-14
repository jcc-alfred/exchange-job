let schedule = require('node-schedule');
let fs= require('fs');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let BitnetService = require('../../Base/Crypto/BitnetService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
let DepositModel = require('../../Model/DepositModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
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
    // var rule = new schedule.RecurrenceRule();
    // var times = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59];
    // rule.minute = times;
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
        let bitnetCoinList = coinList.filter(coin => coin.coin_api_type_id == 1);
        if(!bitnetCoinList){
            isRun = false;
            return;
        }
        let s = await Promise.all(bitnetCoinList.map(async(coin)=>{
            if(!coin.wallet_ip){
                return;
            }
            try{
                let bitnetService = new BitnetService(coin.wallet_ip,coin.wallet_port,coin.wallet_rpc_user,coin.wallet_rpc_pass,coin.wallet_passphrase);
                try{
                    let [netInfo] = await bitnetService.getNetworkInfo();
                    if(!netInfo || !netInfo.connections){
                        return ;
                    }
                }catch(error){
                    return;
                }
                let [transList] = await bitnetService.listTransactions();
                if(transList && Array.isArray(transList) && transList.length > 0){
                    transList = transList.filter((tx)=>tx.category == 'receive');
                    let txidList = [];
                    transList.forEach((tx)=>{
                        if(tx && tx.txid && tx.blockhash){
                            txidList.push(tx.txid);
                        }
                    });
                    if(txidList && txidList.length > 0){
                        let depositList = await DepositModel.getDepositListByTxIdList(txidList);
                        let unProcTxList = [];
                        let blockAddrList = [];
                        transList.forEach((tx)=>{
                            if(tx && tx.txid && tx.blockhash){
                                if(!depositList.find((depositItem)=>depositItem.txid.toLowerCase() == tx.txid.toLowerCase())){
                                    unProcTxList.push(tx);
                                    blockAddrList.push(tx.address);
                                }
                            }
                        });
                        let bitnetTxList = [];
                        if(unProcTxList && unProcTxList.length > 0){
                            let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(blockAddrList,coin.coin_id);
                            unProcTxList.forEach((tx)=>{
                                let [userAssetsItem] = userAssetsList.filter((userAssetsItem)=> userAssetsItem.block_address.toLowerCase() == tx.address.toLowerCase());
                                if(userAssetsItem && userAssetsItem.block_address){
                                    bitnetTxList.push({txObj:tx,userAssets:userAssetsItem}); 
                                }
                            })
                        }
                        if(bitnetTxList && bitnetTxList.length > 0){
                            let w1 = await Promise.all(bitnetTxList.map(async(userTxObj)=>{
                                if(!userTxObj){
                                    return;
                                }
                                try{
                                    let txid = userTxObj.txObj.txid;
                                    let confirmCount = coin.confirm_count > 0 ? coin.confirm_count : 12;
                                    let amount = Utils.checkDecimal(userTxObj.txObj.amount,coin.decimal_digits);
                                    console.log(userTxObj.txObj.txid,amount)
                                    let confirmations = userTxObj.txObj.confirmations;
                                    //确认充值记录状态
                                    let confirmStatus = confirmations >= confirmCount ? 1 : 0;// 0 未确认 1 充值成功 2 充值失败 4 聚合汇总
                                    let userId = userTxObj.userAssets.user_id;
                                    let coinId = coin.coin_id;
                                    let fromBlockAddr = '';
                                    let toBlockAddr = userTxObj.txObj.address;

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
                                                coin.coin_unit
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

            //处理Bitnet未确认记录
            try{
                let bitnetService = new BitnetService(coin.wallet_ip,coin.wallet_port,coin.wallet_rpc_user,coin.wallet_rpc_pass,coin.wallet_passphrase);
                try{
                    let [netInfo] = await bitnetService.getNetworkInfo();
                    if(!netInfo || !netInfo.connections){
                        return;
                    }
                }catch(error){
                    return;
                }
                let unConfirmList = await DepositModel.getUnConfirmDepositListByCoinIdList(coin.coin_id);
               
                if(unConfirmList && unConfirmList.length > 0){
                    let transList = await Promise.all(unConfirmList.map(async(depositItem)=>{
                        let [txObj] = await bitnetService.getTransaction(depositItem.txid);
                        if(txObj && txObj.txid){
                            let confirmCount = coin.confirm_count > 0 ? coin.confirm_count : 2;
                            let amount = Utils.checkDecimal(txObj.amount,coin.decimal_digits);
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
                                        coin.coin_unit
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
            return;
        }));
       
         
        isRun = false;
    }); 
}catch(error){
    isRun = false;
    console.error(error);
}


