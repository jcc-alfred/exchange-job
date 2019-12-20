let schedule = require('node-schedule');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let DepositModel = require('../../Model/DepositModel');
let MailUtils = require('../../Base/Utils/MailUtils');
let rp = require('request-promise');
let WithdrawModel = require('../../Model/WithdrawModel');
let AssetsModel = require('../../Model/AssetsModel');
let OrderModel = require('../../Model/OrderModel');
let moment = require('moment');
let SystemModel = require('../../Model/SystemModel');
let config = require('../../Base/config');
let fs = require('fs');
let ejs = require('ejs');
let Cache = require('../../Base/Data/Cache');
let AIM_Client = require('./AIM_Client');


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
    let File_DIR = __dirname;
    let job = schedule.scheduleJob('0 50 23 * * *', async () => {
    // let job = schedule.scheduleJob('* * * * * *', async () => {
        if (isRun) {
            return;
        }


        isRun = true;
        let date = moment().format('YYYY-MM-DD');
        console.log(Utils.formatString("run report for date : {0}", [date]));

        await AIM_Client.init();
        let coin_list = await CoinModel.getCoinList();
        let GTB_Coin = coin_list.find(i => i.coin_name === "GTB");
        let GTT_Coin = coin_list.find(i => i.coin_name === "GTT");
        let AIM_Coin = coin_list.find(i => i.coin_name === "AIM");
        let USDT_Coin = coin_list.find(i => i.coin_name === "USDT");

        let usdtHistory = await WithdrawModel.getCoinWithdrawHistory(5, 100);
        await Promise.all(
            usdtHistory.map(async (data, index) => {
                usdtHistory[index]['day'] = moment(usdtHistory[index]['day']).format("YYYY-MM-DD");
                usdtHistory[index]["AIM_Sys_deposit_amount"] = await AIM_Client.getUSDTDepositbyDay(moment(data.day).subtract(1, 'days').format("YYYY-MM-DD"),
                    moment(data.day).format("YYYY-MM-DD"));
                let USDT_Deposit = await DepositModel.getDepostSumarybyCoinIdDate(USDT_Coin.coin_id, moment(data.day).format("YYYY-MM-DD"));
                if (USDT_Deposit) {
                    usdtHistory[index]["exchange_deposit_amount"] = USDT_Deposit['total_deposit_amount'];
                } else {
                    usdtHistory[index]["exchange_deposit_amount"] = 0;
                }

                usdtHistory[index]["absolute_amount"] = usdtHistory[index]["AIM_Sys_deposit_amount"] + usdtHistory[index]["exchange_deposit_amount"] - usdtHistory[index]["withdraw_amount"]

            })
        );


        let AIM_Deposit = await DepositModel.getDepostSumarybyCoinIdDate(AIM_Coin.coin_id, date);

        // let coin_exchange_list = await CoinModel.getCoinExchangeList();
        let USDT_PendingWithdraw = await WithdrawModel.getCoinWithdrawPending(USDT_Coin.coin_id);

        let USDT_PendingWithdrawSummary = await WithdrawModel.getCoinWithdrawPendingSumary(USDT_Coin.coin_id);

        let USDT_Withdraw = await WithdrawModel.getCoinWithdrawSumary(USDT_Coin.coin_id, date);
        let UserAssets = await AssetsModel.getUserAssetsSummary();
        let AssetsSumary = {};
        let cache = await Cache.init(config.cacheDB.order);
        await cache.select(config.cacheDB.system);
        let base_price = await cache.hgetall(config.cacheKey.Sys_Base_Coin_Prices);

        await cache.close();
        UserAssets.map(item => {
            AssetsSumary[item.coin_name] = item;
            const price_list = Object.values(base_price).map(i => JSON.parse(i));
            let coin_price = price_list.find(i => i.symbol.toLowerCase() === item.coin_name.toLowerCase());
            if (coin_price) {
                AssetsSumary[item.coin_name]['price_usd'] = Utils.checkDecimal(Utils.mul(coin_price['price_usd'], item.total_assets), 2)
            } else {
                AssetsSumary[item.coin_name]['price_usd'] = 0
            }
        });
        UserAssets = UserAssets.map(function (item) {
            const price_list = Object.values(base_price).map(i => JSON.parse(i));
            let coin_price = price_list.find(i => i.symbol.toLowerCase() === item.coin_name.toLowerCase());
            if (coin_price) {
                item['price_usd'] = Utils.checkDecimal(Utils.mul(coin_price['price_usd'], item.total_assets), 2);
            } else {
                item['price_usd'] = 0
            }
            return item
        });
        let html = fs.readFileSync(File_DIR + '/report_template.html', {encoding: 'utf-8'});

        let data = {
            USDT_HISTORY: usdtHistory,
            USDT_PendingWithdraw: USDT_PendingWithdraw,
            USDT_PendingWithdrawSummary: USDT_PendingWithdrawSummary,
            AIM_DEPOSIT_DAY: AIM_Deposit,
            USDT_WITHDRAW_DAY: USDT_Withdraw,
            UserAssets: UserAssets,
            date: date,
        };

        let email_content = ejs.render(html, data);


        let mailConfig = await SystemModel.getSysConfigByTypeId(3);
        let host = mailConfig.find((item) => {
            return item.config_key === 'host'
        }).config_value;
        let port = mailConfig.find((item) => {
            return item.config_key === 'port'
        }).config_value;
        let secure = mailConfig.find((item) => {
            return item.config_key === 'secure'
        }).config_value == '1' ? true : false;
        let secureConnection = mailConfig.find((item) => {
            return item.config_key == 'secureConnection'
        }).config_value == '1' ? true : false;
        let user = mailConfig.find((item) => {
            return item.config_key == 'user'
        }).config_value;
        let pass = mailConfig.find((item) => {
            return item.config_key == 'pass'
        }).config_value;
        let mailFrom = mailConfig.find((item) => {
            return item.config_key == 'mailFrom'
        }).config_value;

        MailUtils.init(host, port, secure, secureConnection, user, pass, mailFrom);
        for (let i in config.report_emails) {
            let toemail = config.report_emails[i];
            try {
                sendResult = await MailUtils.sendMail({
                    to: toemail,
                    title: Utils.formatString("{0} GTB交易所数据统计", [date]),
                    text: '',
                    html: email_content
                });
                console.log("Send Report Mail successfully")
            }
            catch (error) {
                console.log(error);
                sendResult = false;
            }
        }
        isRun = false;


    });
} catch (error) {
    isRun = false;
    console.error(error);
}