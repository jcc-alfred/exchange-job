let schedule = require('node-schedule');
let fs= require('fs');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let BitnetService = require('../../Base/Crypto/BitnetService');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let EntrustModel = require('../../Model/EntrustModel');
let AssetsModel = require('../../Model/AssetsModel');
let DepositModel = require('../../Model/DepositModel');
let UserAlertModel = require('../../Model/UserAlertModel');
let UserModel = require('../../Model/UserModel');
let rp = require('request-promise');
let config = require('../../Base/config');
let Cache = require('../../Base/Data/Cache');
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
    var job = schedule.scheduleJob('1 */10 * * * *',async()=>{
        if(isRun){
            return;
        }
        isRun = true;
        let res = [];
        let currency = JSON.parse(await rp({
            method:'GET',
            uri:config.currency_api,
            qs:{
                access_key:config.currency_secret,
            }
        }));
        let gtt_value={
            name: 'GTT',
            symbol: 'GTT',
            price_usd: 1/currency.quotes.USDCNY,
            last_updated: new Date(currency.timestamp*1000).toISOString()
        };
        res.push(gtt_value);

        const requestOptions = {
            method: 'GET',
            uri: config.coinmarket_api,
            qs: {
                start: 1,
                limit: 5,
                convert: 'USD'
            },
            headers: {
                'X-CMC_PRO_API_KEY': config.coinmarket_secret
            },
            json: true,
            gzip: true
        };

        let response = await rp(requestOptions);
        // console.log('API call response:', response);

        if (response) {
            let cache = await Cache.init(config.cacheDB.system);
            try{
                let ckey = config.cacheKey.Sys_Base_Coin_Prices;
                for (let i in response.data){
                    let item= response.data[i];
                    let value = {
                        name: item.name,
                        symbol: item.symbol,
                        price_usd: item.quote.USD.price,
                        last_updated: item.last_updated
                    };
                    res.push(value);
                    // await cache.hset(ckey, value.symbol.toLowerCase(), value);
                    if (item.symbol.toLowerCase() == 'btc') {
                        let GTB_BTC_CoinID = await CoinModel.getCoinIDbyName('GTB/BTC');
                        let last_order =  await EntrustModel.getLastOrder(GTB_BTC_CoinID);
                        if (last_order){
                            let GTB_BTC_Price = last_order.trade_price;
                            let gtb_value = {
                                name: 'GTB',
                                symbol: "GTB",
                                price_usd: GTB_BTC_Price * value.price_usd,
                                last_updated: item.last_updated
                            };
                            res.push(gtb_value);
                            // await cache.hset(ckey,gtb_value.symbol.toLowerCase(),gtb_value);
                        }
                    }
                }
                Promise.all(res.map(item=>{
                    return cache.hset(ckey,item.symbol.toLowerCase(),item);
                }));
                // await cache.expire(ckey, 600);
                // console.log(new Date(),res);
            }catch (e) {
                console.error(e);
            }finally {
                cache.close();
            }
        }
        isRun = false;
    });
}catch(error){
    isRun = false;
    throw error;
}


