let schedule = require('node-schedule');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let DepositModel = require('../../Model/DepositModel');
let MailUtils = require('../../Base/Utils/MailUtils');
let rp = require('request-promise');
let WithdrawModel = require('../../Model/WithdrawModel');
let OrderModel = require('../../Model/OrderModel');
let moment = require('moment');
let SystemModel = require('../../Model/SystemModel');
let config = require('../../Base/config');
let fs = require('fs');
let ejs = require('ejs');

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
        // let date = '2019-03-28';
        console.log(Utils.formatString("ruh report for date : {0}", [date]));

        let unlock_Data = await rp({
            method: 'POST',
            uri: 'https://www.gttdollar.com:8090/gtb/unlock-analysis',
            formData: {
                startDate: date,
                endDate: date
            },
            json: true
        });

        let coin_list = await CoinModel.getCoinList();
        let GTB_Coin = coin_list.find(i => i.coin_name === "GTB");
        let GTT_Coin = coin_list.find(i => i.coin_name === "GTT");
        let GTB_Deposit = await DepositModel.getDepostSumarybyCoinIdDate(GTB_Coin.coin_id, date);

        let coin_exchange_list = await CoinModel.getCoinExchangeList();
        let GTB_GTT = coin_exchange_list.find(i => i.coin_id === GTB_Coin.coin_id && i.exchange_coin_id === GTT_Coin.coin_id);
        let GTB_GTT_transaction_sumary = await OrderModel.getcoin_exchange_amount(GTB_GTT.coin_exchange_id, date);

        let GTT_Withdraw = await WithdrawModel.getCoinWithdrawSumary(GTT_Coin.coin_id, date);

        let html = fs.readFileSync(File_DIR + '/report_template.html', {encoding: 'utf-8'});

        let data = {
            GTB_UNLOCK_TOTAL: unlock_Data['data']['allData'],
            GTB_UNLOCK_DAY: unlock_Data['data']['filterData'],
            GTB_DEPOSIT_DAY: GTB_Deposit,
            GTB_TRASACTION_DAY: GTB_GTT_transaction_sumary,
            GTB_WITHDRAW_DAY: GTT_Withdraw,
            date: date
        };

        if ("filterTokenDataMap" in unlock_Data['data']) {
            if ("FAC" in unlock_Data['data']["filterTokenDataMap"]) {
                data.FAC_UNLOCK_DAY= unlock_Data['data']["filterTokenDataMap"]["FAC"]

            }
            if ("FGTB" in unlock_Data['data']["filterTokenDataMap"]) {
                    data.FGTB_UNLOCK_DAY= unlock_Data['data']["filterTokenDataMap"]["FGTB"]
            }
        }
        if ("allTokenDataMap" in unlock_Data['data']) {
            if ("FAC" in unlock_Data['data']["allTokenDataMap"]) {
                    data.FAC_UNLOCK_TOTAL= unlock_Data['data']["allTokenDataMap"]["FAC"]
            }
            if ("FGTB" in unlock_Data['data']["allTokenDataMap"]) {
                    data.FGTB_UNLOCK_TOTAL= unlock_Data['data']["allTokenDataMap"]["FGTB"]
            }
        }
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