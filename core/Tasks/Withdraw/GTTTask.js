let schedule = require('node-schedule');
let GTTService = require('../../Base/Crypto/GTTService');
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

try {
    let rule = new schedule.RecurrenceRule();
    let times = [1, 6,8,9,10, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56];
    rule.minute = times;
    let isRun = false;

    schedule.scheduleJob('1 * * * * *', async () => {

    // schedule.scheduleJob(rule, async () => {
        if (isRun) {
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if (!coinList) {
            isRun = false;
            return;
        }
        let [gttCoin] = coinList.filter(coin => coin.coin_api_type_id == 8 && coin.coin_id == 17);
        if (!gttCoin || !gttCoin.wallet_ip) {
            isRun = false;
            return;
        }
        let gttService = new GTTService(gttCoin.wallet_ip);
        try {
            let withdrawCount = await WithdrawModel.getUnProcListCountByCoinId(gttCoin.coin_id);
            let pageSize = 100;
            let pageCount = Math.ceil(withdrawCount / pageSize);
            for (let page = 1; page <= pageCount; page++) {
                //未处理的提现列表
                let withdrawList = await WithdrawModel.getUnProcListByCoinId(gttCoin.coin_id, page, pageSize);
                let totalWithdrawList = [];
                let interWithdrawList = [];
                let transWithdrawList = [];
                let transTotalAmount = 0;
                if (!withdrawList || !withdrawList.list || !withdrawList.list.length) {
                    return;
                }
                let transBlockAddrList = [];
                await Promise.all(withdrawList.list.map(async (withdraw) => {
                    // let isAddress = gttService.isAddress(withdraw.to_block_address);
                    // if (isAddress) {
                    transBlockAddrList.push(withdraw.to_block_address);
                    transTotalAmount = Utils.add(transTotalAmount, withdraw.trade_amount);
                    totalWithdrawList.push(withdraw);
                    // }
                }));
                if (!transBlockAddrList || transBlockAddrList.length <= 0) {
                    continue;
                }
                //内部提现转账 start
                let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(transBlockAddrList, gttCoin.coin_id);
                if (userAssetsList && userAssetsList.length > 0) {
                    //内部提现转账
                    transTotalAmount = 0;
                    transBlockAddrList = [];
                    let userBlockAddrList = userAssetsList.map((userAssetsItem) => {
                        return userAssetsItem.block_address.toLowerCase();
                    });
                    totalWithdrawList.forEach((withdraw) => {
                        if (userBlockAddrList.includes(withdraw.to_block_address.toLowerCase())) {
                            let assetsItem = userAssetsList.find((userAssetsItem) => userAssetsItem.block_address.toLowerCase() == withdraw.to_block_address.toLowerCase());
                            interWithdrawList.push({
                                user_withdraw_id: withdraw.user_withdraw_id,
                                to_user_id: assetsItem.user_id,
                                trade_amount: withdraw.trade_amount
                            });
                        } else {
                            //外部提现
                            transWithdrawList.push(withdraw);
                            transBlockAddrList.push(withdraw.to_block_address);
                            transTotalAmount = Utils.add(transTotalAmount, withdraw.trade_amount);
                        }
                    });
                    if (interWithdrawList && interWithdrawList.length > 0) {
                        await Promise.all(interWithdrawList.map(async (item) => {
                            let res = await WithdrawModel.interTransfer(item.user_withdraw_id, item.to_user_id);
                            if (res) {
                                //let amount = item.trade_amount;
                                //发送通知
                                UserModel.sendAlert(
                                    item.to_user_id,
                                    UserAlertModel.alertTypeMap.payOut,
                                    'en-us',
                                    item.trade_amount,
                                    gttCoin.coin_unit
                                );
                            }
                            console.log('interTransfer:', res);

                        }));
                    }
                } else {
                    transWithdrawList = totalWithdrawList;
                }
                //内部提现转账 end
                if (transWithdrawList && transWithdrawList.length > 0) {
                    for (let i in transWithdrawList){
                        let item= transWithdrawList[i];
                        let totalWalletAmount = await gttService.getBalance(gttCoin.main_block_address);
                        if (totalWalletAmount < Utils.add(item.trade_amount, 0.0004)) {
                            console.error('钱包余额不足：totalWalletAmount:' + totalWalletAmount + ' trade_amount:' + item.trade_amount);
                            return;
                        }

                        // sleep for 1 second to decrease the frequency.
                        await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](1000);

                        let secret = gttCoin.main_block_address_private_key;
                        let txObj = await gttService.sendSignedTransaction(gttCoin.main_block_address, item.to_block_address, item.trade_amount, secret);
                        if (txObj && txObj.id) {
                            // 修改数据库
                            let res = await WithdrawModel.setTxIdById(txObj.id, item.user_withdraw_id);
                            console.log(txObj.id, item.trade_amount);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
        }
        //TODO add get transaction api
        //处理ETH提现记录
        try {
            let unConfirmList = await WithdrawModel.getUnConfirmWithdrawListByCoinIdList(gttCoin.coin_id);
            let currenctBlockNum = await gttService.getBlockNumber();
            if (unConfirmList && unConfirmList.length > 0) {
                await Promise.all(unConfirmList.map(async (withdrawItem) => {
                    let txObj = await gttService.getTransaction(withdrawItem.txid);
                    if (txObj && txObj.id) {
                        let confirmations = currenctBlockNum - txObj.id;
                        //确认提现
                        let res = await WithdrawModel.confirmWithdraw(withdrawItem.txid, confirmations);
                        if (res.affectedRows) {
                            //增加用户资产日志
                            let logRes = await AssetsLogModel.addUserAssetsLog(withdrawItem.serial_num, withdrawItem.user_id, withdrawItem.coin_id, gttCoin.coin_unit, withdrawItem.submit_amount, withdrawItem.balance_amount, 2, 2, '提现');
                            //发送通知
                            UserModel.sendAlert(
                                withdrawItem.user_id,
                                UserAlertModel.alertTypeMap.payOut,
                                'en-us',
                                withdrawItem.submit_amount,
                                gttCoin.coin_unit
                            );
                            //写入系统手续费表
                            let fees = 0;
                            TransferFeesLogModel.addTransferFees(gttCoin.coin_id, withdrawItem.txid, gttCoin.coin_id, fees, 'GTT提现手续费');
                        }
                    }

                }));
            }
        } catch (error) {
            console.error(error);
        }

        isRun = false;
    });
} catch (error) {
    isRun = false;
    console.error(error);
}

