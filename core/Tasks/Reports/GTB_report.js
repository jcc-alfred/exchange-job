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
    let job = schedule.scheduleJob('* * * * * *', async () => {
        if (isRun) {
            return;
        }
        isRun = true;
        let date= moment().format('YYYY-MM-DD');

        let GTB_unlock_Data= await rp({
            method:'POST',
            uri:'https://www.gttdollar.com:8090/gtb/unlock-analysis',
            body:{
                startDate:date,
                endDate:date
            },
            json:true
        });
        let list = Object.entries(GTB_unlock_Data['data']['allData']);
        let p="";
        let content ="";
        for (let i in list){
            p=p+Utils.formatString('<p>{0}</p>',[list[i][0]+":"+list[i][1]])
        }
        content = content+ "<br><div class='data'>"+"<h2>GTB解锁总共数据</h2>"+p +"</div>";

        list = Object.entries(GTB_unlock_Data['data']['filterData']);
        p="";
        for (let i in list){
            p=p+Utils.formatString('<p>{0}</p>',[list[i][0]+":"+list[i][1]])
        }
        content = content+"<br><div class='data'>"+Utils.formatString("<h2>GTB解锁数据{0}-{1}</h2>",[GTB_unlock_Data['data']['filterData']['startDate'],GTB_unlock_Data['data']['filterData']['endDate']])+p +"</div>";

        let coin_list = await CoinModel.getCoinList();
        let GTB_Coin= coin_list.find(i=>i.coin_name==="GTB");
        let GTT_Coin= coin_list.find(i=>i.coin_name==="GTT");
        let GTB_Deposit =await DepositModel.getDepostSumarybyCoinIdDate(GTB_Coin.coin_id,date);
        list = Object.entries(GTB_Deposit);
        p="";
        for (let i in list){
            p=p+Utils.formatString('<p>{0}</p>',[list[i][0]+":"+list[i][1]])
        }
        content = content+"<br><div class='data'>"+Utils.formatString("<h2>GTB存币数据 {0}</h2>",[date])+p +"</div>";


        let coin_exchange_list = await CoinModel.getCoinExchangeList();
        let GTB_GTT= coin_exchange_list.find(i=> i.coin_id===GTB_Coin.coin_id&& i.exchange_coin_id===GTT_Coin.coin_id);
        let GTB_GTT_transaction_sumary= await OrderModel.getcoin_exchange_amount(GTB_GTT.coin_exchange_id,date);
        list = Object.entries(GTB_GTT_transaction_sumary);
        p="";
        for (let i in list){
            p=p+Utils.formatString('<p>{0}</p>',[list[i][0]+":"+list[i][1]])
        }
        content = content+"<br><div class='data'>"+Utils.formatString("<h2>GTB/GTT交易额数据 {0}</h2>",[date])+p +"</div>";
        let GTT_Withdraw = await WithdrawModel.getCoinWithdrawSumary(GTT_Coin.coin_id,date);
        list = Object.entries(GTT_Withdraw);
        p="";
        for (let i in list){
            p=p+Utils.formatString('<p>{0}</p>',[list[i][0]+":"+list[i][1]])
        }
        content = content+"<br><div class='data'>"+Utils.formatString("<h2>GTT提币数据 {0}</h2>",[date])+p +"</div>";
        let html = '<!DOCTYPE html>' +
            '<html>' +
            '<head>' +
            '<title>{0} GTB交易所数据统计</title>' +
            '</head>' +
            '<style type="text/css">' +
            'body { align-items: center;background-color: white }' +
            'h1,h2 {text-align: center;}' +
            'table {' +
            'margin-left: 50%;' +
            '}' +
            'table, th,td{' +
            'border:1px solid blue;' +
            'border-collapse: collapse;' +
            '}' +
            '' +
            '.data {' +
            'border:1px solid blue;' +
            'display: inline-block;' +
            'margin-left: 50%' +
            '}' +
            '.data p,h2 {' +
            'text-align: center;' +
            'border-bottom:1px solid blue;' +
            'margin: unset;' +
            '}' +
            '' +
            '</style>' +
            '<body>' +
            '<h1>{1} GTB交易所数据统计</h1>' +
            '{2}' +
            '</body>' +
            '</html>'

        html = Utils.formatString(html,[date,date,content]);




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
        for (let i in config.report_emails){
            let email = config.report_emails[i];
            try {
                sendResult = await MailUtils.sendMail({
                    to: email,
                    title: Utils.formatString("{0} GTB交易所数据统计",[date]),
                    text: '',
                    html: html
                })
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