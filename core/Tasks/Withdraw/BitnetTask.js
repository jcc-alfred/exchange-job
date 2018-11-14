let schedule = require('node-schedule');
let fs= require('fs');
let _ = require('lodash');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let BitnetService = require('../../Base/Crypto/BitnetService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
let WithdrawModel = require('../../Model/WithdrawModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
let TransferFeesLogModel = require('../../Model/TransferFeesLogModel');
let AssetsLogModel = require('../../Model/AssetsLogModel');

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
    var times = [1,6,11,16,21,26,31,36,41,46,51,56];
    rule.minute = times;

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
                let withdrawCount = await WithdrawModel.getUnProcListCountByCoinId(coin.coin_id);
                let pageSize = 100;
                let pageCount = Math.ceil(withdrawCount / pageSize);
                let bitnetService = new BitnetService(coin.wallet_ip,coin.wallet_port,coin.wallet_rpc_user,coin.wallet_rpc_pass,CryptoUtils.aesDecode(coin.wallet_passphrase));
                try{
                    let [netInfo] = await bitnetService.getNetworkInfo();
                    if(!netInfo || !netInfo.connections){
                        return;
                    }
                }catch(error){
                    return;
                }
                if(coin.wallet_passphrase){
                    await bitnetService.WalletLock();
                    await bitnetService.WalletPassphrase();
                }
                for(let page = 1; page <= pageCount; page++){
                    //未处理的提现列表
                    let withdrawList = await WithdrawModel.getUnProcListByCoinId(coin.coin_id,page,pageSize);
                    let totalWithdrawList = [];
                    let interWithdrawList = [];
                    let transWithdrawList = [];
                    let transTotalAmount = 0;
                    if(!withdrawList|| !withdrawList.list || !withdrawList.list.length){
                        return;
                    }
                    let transBlockAddrList = [];
                    await Promise.all(withdrawList.list.map(async(withdraw)=>{
                        let validObj = await bitnetService.validateAddress(withdraw.to_block_address);
                        if(validObj && validObj[0].isvalid){
                            transBlockAddrList.push(withdraw.to_block_address);
                            transTotalAmount = Utils.add(transTotalAmount,withdraw.trade_amount);
                            totalWithdrawList.push(withdraw);
                        }
                        return;
                    }));
                    if(!transBlockAddrList || transBlockAddrList.length <= 0 ){
                        continue;
                    }
                    //内部提现转账 start
                    let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(transBlockAddrList,coin.coin_id);
                    if(userAssetsList && userAssetsList.length > 0){
                        //内部提现转账
                        transTotalAmount = 0;
                        transBlockAddrList = [];
                        let userBlockAddrList = userAssetsList.map((userAssetsItem)=>{return userAssetsItem.block_address.toLowerCase();});
                        totalWithdrawList.forEach((withdraw)=> {
                            if(userBlockAddrList.includes(withdraw.to_block_address.toLowerCase())){
                                let assetsItem = userAssetsList.find((userAssetsItem)=>userAssetsItem.block_address.toLowerCase() == withdraw.to_block_address.toLowerCase());
                                interWithdrawList.push({
                                    user_withdraw_id:withdraw.user_withdraw_id,
                                    to_user_id:assetsItem.user_id,
                                    trade_amount:withdraw.trade_amount
                                });
                            }else{
                                //外部提现
                                transWithdrawList.push(withdraw);
                                transBlockAddrList.push(withdraw.to_block_address);
                                transTotalAmount = Utils.add(transTotalAmount,withdraw.trade_amount);
                            }
                        });
                        if(interWithdrawList && interWithdrawList.length > 0){
                            await Promise.all(interWithdrawList.map(async(item)=>{
                                let res = await WithdrawModel.interTransfer(item.user_withdraw_id,item.to_user_id);
                                if(res){
                                    //let amount = item.trade_amount;
                                    //发送通知
                                    UserModel.sendAlert(
                                        item.to_user_id,
                                        UserAlertModel.alertTypeMap.payOut,
                                        'en-us',
                                        item.trade_amount,
                                        coin.coin_unit
                                    );
                                }
                                console.log('interTransfer:',res);
                                return;
                            }));
                        }
                    }else{
                        transWithdrawList = totalWithdrawList;
                    }
                    //内部提现转账 end
                    if(transWithdrawList && transWithdrawList.length > 0){
                        let totalWalletAmount = await bitnetService.getBalance();
                        if(totalWalletAmount < Utils.add(transTotalAmount,0.001)){
                            console.error('钱包余额不足：totalWalletAmount:' + totalWalletAmount + ' transTotalAmount:' + transTotalAmount);
                            continue;
                        }
                        let tmpObj = _.groupBy(transWithdrawList,(item)=>{
                            return item.to_block_address;
                        });
                        let transferList = [];
                        if(transWithdrawList.length > Object.keys(tmpObj).length){
                            //有重复地址的提现
                            for(let key in tmpObj){
                                let wList = tmpObj[key];
                                let tradeAmount = 0;
                                wList.forEach((item)=>{
                                    tradeAmount = Utils.add(tradeAmount,item.trade_amount);
                                });
                                transferList.push({to_block_address:key,trade_amount:tradeAmount});
                            }
                        }else{
                            transferList = transWithdrawList;
                        }
                        let txList = {};
                        transferList.forEach((withdrawItem)=>{
                            txList[withdrawItem.to_block_address]= withdrawItem.trade_amount;
                        });
                        let [txid] = await bitnetService.sendMany(txList);
                        if(txid && txid != '' && !txid.hasOwnProperty('code')){
                            // 修改数据库
                            let res = await WithdrawModel.setTxIdByCoinIdBlockAddrList(txid,coin.coin_id,transBlockAddrList);
                            console.log(txid,transTotalAmount);
                        }
                        
                    }
                }
                if(coin.wallet_passphrase){
                    await bitnetService.WalletLock();
                }
                
            }catch(error){
                console.error(error);
            }

            //处理Bitnet提现记录
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
                let unConfirmList = await WithdrawModel.getUnConfirmWithdrawListByCoinIdList(coin.coin_id);
                
                if(unConfirmList && unConfirmList.length > 0){
                    let tmpObj = _.groupBy(unConfirmList,(item)=>{
                        return item.txid;
                    });
                    for(let txid in tmpObj){
                        let [txObj] = await bitnetService.getTransaction(txid);
                        if(txObj && txObj.txid){
                            let confirmCount = coin.confirm_count > 0 ? coin.confirm_count : 2;
                            let confirmations = txObj.confirmations;
                            //确认提现记录状态
                            //let userId = withdrawItem.user_id;
                            let confirmStatus = confirmations >= confirmCount ? 1 : 0;
                            if(confirmStatus == 1){
                                //确认提现
                                let res = await WithdrawModel.confirmWithdraw(txid,confirmations);
                                if(res.affectedRows){
                                    let wList = tmpObj[txid];
                                    wList.forEach((withdrawItem)=>{
                                        //let amount = Utils.checkDecimal(withdrawItem.trade_amount,coin.decimal_digits);
                                        //增加用户资产日志 
                                        let logRes = AssetsLogModel.addUserAssetsLog(withdrawItem.serial_num,withdrawItem.user_id,withdrawItem.coin_id,coin.coin_unit,withdrawItem.submit_amount,withdrawItem.balance_amount,2,2,'提现');
                                        //发送通知
                                        UserModel.sendAlert(
                                            withdrawItem.user_id,
                                            UserAlertModel.alertTypeMap.payOut,
                                            'en-us',
                                            withdrawItem.submit_amount,
                                            coin.coin_unit
                                        );
                                    });
                                    //写入系统手续费表
                                    TransferFeesLogModel.addTransferFees(coin.coin_id,txid,coin.coin_id,txObj.fee,'Bitnet提现手续费');
                                }
                            }
                        }
                    }
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
    console.error(error) ;
}


