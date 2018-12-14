let schedule = require('node-schedule');
let fs = require('fs');
let GTTService = require('../../Base/Crypto/GTTService');
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

try {
    console.log("aaaaa");
    let isRun = false;
    schedule.scheduleJob('1 * * * * *', async () => {
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
        if (!gttCoin) {
            isRun = false;
            return;
        }
        try {
            let lastProcBlockNum = fs.readFileSync(__dirname + '/GTTBlockNumber', {
                encoding: 'utf-8',
                flag: 'r'
            });
            console.log('lastProcBlockNum', lastProcBlockNum);
            let gttService = new GTTService(gttCoin.wallet_ip);
            let currentBlockNum =await gttService.getBlockNumber();
            console.log('******currentBlockNum:' + currentBlockNum);
            if (parseInt(currentBlockNum) >= parseInt(lastProcBlockNum)) {
                let transactions = await gttService.getTransactionFromBlock(lastProcBlockNum);
                let transList = transactions.filter(tx => tx.currency == 'GTT');
                let blockAddrList = transList.map(tx => tx.opponentUserWalletAddress);

                if (blockAddrList && blockAddrList.length > 0) {
                    let userAssetsList = await AssetsModel.getUserAssetsByBlockAddrListCoinId(blockAddrList, gttCoin.coin_id);
                    let ethTxList = [];
                    transList.forEach((tx) => {
                        if (tx && tx.opponentUserWalletAddress) {
                            let [userAssetsItem] = userAssetsList.filter((userAssetsItem) => userAssetsItem.block_address.toLowerCase() == tx.opponentUserWalletAddress.toLowerCase());
                            if (userAssetsItem && userAssetsItem.block_address) {
                                ethTxList.push({
                                    txObj: tx,
                                    userAssets: userAssetsItem
                                });
                            }
                        }
                    });

                    if (ethTxList && ethTxList.length > 0) {
                        await Promise.all(ethTxList.map(async (userTxObj) => {
                            if (!userTxObj) {
                                return;
                            }
                            try {
                                let txid = userTxObj.txObj.id;
                                let amount = Utils.checkDecimal(userTxObj.txObj.amount, gttCoin.decimal_digits);
                                console.log(txid, amount);
                                let confirmations = currentBlockNum - txid;
                                let [depositItem] = await DepositModel.getUserDepositByTxId(txid);
                                //确认充值记录状态和是否为聚合汇总记录
                                // 0 未确认 1 充值成功 2 充值失败 4 聚合汇总
                                if (!depositItem) {
                                    let userId = userTxObj.userAssets.user_id;
                                    let coinId = gttCoin.coin_id;
                                    let fromBlockAddr = userTxObj.txObj.userWalletAddress ? userTxObj.txObj.userWalletAddress : userTxObj.txObj.userId;
                                    let toBlockAddr = userTxObj.txObj.opponentUserWalletAddress;
                                    //新增充值记录
                                    let res = await DepositModel.addUserDesposit(userId, coinId, txid, fromBlockAddr, toBlockAddr, amount, confirmations);
                                    if (res.affectedRows) {
                                        //确认充值
                                        let res = await DepositModel.confirmDeposit(txid, confirmations);
                                        if (res) {
                                            //发送通知
                                            UserModel.sendAlert(
                                                userId,
                                                UserAlertModel.alertTypeMap.payIn,
                                                'en-us',
                                                amount,
                                                gttCoin.coin_unit
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

                fs.writeFileSync(__dirname + '/GTTBlockNumber', currentBlockNum, {encoding: 'utf-8', flag: 'w'});
            }
        } catch (error) {
            console.error(error);
            // throw error;
        }
        isRun = false;
    });
} catch (error) {
    isRun = false;
    console.error(error);
}