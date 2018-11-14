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
        let [ethCoin] = coinList.filter(coin => coin.coin_api_type_id == 2);
        if(!ethCoin || !ethCoin.wallet_ip){
            isRun = false;
            return;
        }
        let erc20List = coinList.filter(coin => coin.coin_api_type_id == 3);
        if(!erc20List || erc20List.length <= 0){
            isRun = false;
            return;
        }
        let s = await Promise.all(erc20List.map(async(coin)=>{
            try{
                if(!coin.wallet_ip){
                    return;
                }
                let withdrawCount = await WithdrawModel.getUnProcListCountByCoinId(coin.coin_id);
                let pageSize = 100;
                let pageCount = Math.ceil(withdrawCount / pageSize);
                let ethService = new EthService(coin.wallet_ip,coin.wallet_port,coin.wallet_passphrase);
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
                        let isAddress = ethService.isAddress(withdraw.to_block_address);
                        if(isAddress){
                            transBlockAddrList.push(withdraw.to_block_address);
                            transTotalAmount = Utils.add(transTotalAmount,withdraw.trade_amount);
                            totalWithdrawList.push(withdraw);
                        }

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

                            }));
                        }
                    }else{
                        transWithdrawList = totalWithdrawList;
                    }
                    //内部提现转账 end
                    if(transWithdrawList && transWithdrawList.length > 0){
                        await Promise.all(transWithdrawList.map(async(item)=>{
                            let totalWalletAmountWei = await ethService.getTokenBalance(coin.main_block_address,coin.contract_address);
                            let totalWalletAmount = totalWalletAmountWei/Math.pow(10,coin.token_decimals);
                            if(totalWalletAmount < item.trade_amount){
                                console.error('钱包余额不足：totalWalletAmount:' + totalWalletAmount + ' trade_amount:' + item.trade_amount);
                                return;
                            }
                            let totalETHWalletAmountWei = await ethService.getBalance(coin.main_block_address);
                            let totalETHWalletAmount = ethService.weiToEther(totalETHWalletAmountWei);
                            if(totalETHWalletAmount < 0.00006){
                                console.error('钱包ETH余额手续费不足：totalETHWalletAmount:' + totalETHWalletAmount);
                                return;
                            }
                            let privateKey = CryptoUtils.aesDecode(coin.main_block_address_private_key);
                            let txObj = await ethService.sendTokenSignedTransaction(item.to_block_address,item.trade_amount,privateKey,coin.contract_address,coin.token_decimals);
                            if(txObj && txObj.transactionHash){
                                // 修改数据库
                                let res = await WithdrawModel.setTxIdById(txObj.transactionHash,item.user_withdraw_id);
                                console.log(txObj.transactionHash,item.trade_amount);
                            }

                        }));                    
                    }
                }            
            }catch(error){
                console.error(error);
            }
    
            //处理ERC20提现记录
            try{
                let ethService = new EthService(coin.wallet_ip,coin.wallet_port,coin.wallet_passphrase);
                let unConfirmList = await WithdrawModel.getUnConfirmWithdrawListByCoinIdList(coin.coin_id);
                let currenctBlockNum = await ethService.getBlockNumber();
                if(unConfirmList && unConfirmList.length > 0){
                    await Promise.all(unConfirmList.map(async(withdrawItem)=>{
                        let txObj = await ethService.getTransaction(withdrawItem.txid);
                        if(txObj && txObj.blockNumber && txObj.hash){
                            let confirmCount = coin.confirm_count > 0 ? coin.confirm_count : 12;
                            let confirmations = currenctBlockNum - txObj.blockNumber;
                            //确认提现记录状态
                            let confirmStatus = confirmations >= confirmCount ? 1 : 0;
                            if(confirmStatus == 1){
                                //确认提现
                                let res = await WithdrawModel.confirmWithdraw(withdrawItem.txid,confirmations);
                                if(res.affectedRows){
                                    //增加用户资产日志 
                                    let logRes = await AssetsLogModel.addUserAssetsLog(withdrawItem.serial_num,withdrawItem.user_id,withdrawItem.coin_id,coin.coin_unit,withdrawItem.submit_amount,withdrawItem.balance_amount,2,2,'提现');
                                    //发送通知
                                    UserModel.sendAlert(
                                        withdrawItem.user_id,
                                        UserAlertModel.alertTypeMap.payOut,
                                        'en-us',
                                        withdrawItem.submit_amount,
                                        coin.coin_unit
                                    );
                                    //写入系统手续费表
                                    let fees = ethService.weiToEther(txObj.gas * txObj.gasPrice);
                                    TransferFeesLogModel.addTransferFees(coin.coin_id,txObj.hash,ethCoin.coin_id,fees,'ERC20提现手续费');
                                }
                            }
                        }

                    }));
                }
            }catch(error){
                console.error(error);
            }

        }));
         
        isRun = false;
    }); 
}catch(error){
    isRun = false;
    console.error(error) ;
}


