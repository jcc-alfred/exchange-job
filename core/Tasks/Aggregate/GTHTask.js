let schedule = require('node-schedule');
let GTHService = require('../../Base/Crypto/GTHService');
let CoinModel = require('../../Model/CoinModel');
let AssetsModel = require('../../Model/AssetsModel');
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
    schedule.scheduleJob(rule, async () => {
        if (isRun) {
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if (!coinList) {
            isRun = false;
            return;
        }
        let [gthCoin] = coinList.filter(coin => coin.coin_api_type_id == 8 && coin.coin_id == 20);
        if (!gthCoin || !gthCoin.wallet_ip) {
            isRun = false;
            return;
        }
        //GTT汇总
        try {
            let gthService = new GTHService(gthCoin.wallet_ip);
            let gth_userCount = await AssetsModel.getUserNoEmptyAssetsCountByCoinId(gthCoin.coin_id);
            let gth_pageSize = 500;
            let gth_pageCount = Math.ceil(gth_userCount / gth_pageSize);
            let gth_userBalanceList = [];//所有用户GTT余额信息
            for (let page = 1; page <= gth_pageCount; page++) {
                let assetsList = await AssetsModel.getNoEmptyAssetsByCoinId(gthCoin.coin_id, page, gth_pageSize);
                if (!assetsList || !assetsList.list || !assetsList.list.length) {
                    return;
                }
                await Promise.all(assetsList.list.map(async (item) => {
                    let balance = await gthService.getBalance(item.block_address);
                    if (balance == 0 || balance < gthCoin.min_aggregate_amount) {
                        return;
                    }
                    gth_userBalanceList.push({
                        block_address: item.block_address,
                        private_key: item.private_key,
                        gth_balance: balance
                    });

                }));
            }
            await Promise.all(gth_userBalanceList.map(async (userGTTBalance) => {
                let secret = userGTTBalance.private_key;
                let trade_amount = userGTTBalance.gth_balance;
                if (trade_amount > gthService.transactionFee) {
                    let txObj = await gthService.sendSignedTransaction(userGTTBalance.block_address, gthCoin.main_block_address, trade_amount, secret);
                    if (txObj && txObj.id) {
                        // 增加汇总记录
                        let res = await CoinAggregateModel.addCoinAggregate(txObj.id, gthCoin.coin_id, userGTTBalance.block_address, gthCoin.main_block_address, trade_amount, '汇总GTH');
                        //写入系统手续费表
                        TransferFeesLogModel.addTransferFees(gthCoin.coin_id, txObj.id, gthCoin.coin_id, 0, '汇总GTH手续费');
                        console.log(txObj.id, trade_amount);
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


