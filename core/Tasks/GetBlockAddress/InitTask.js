let schedule = require('node-schedule');
let CoinModel = require('../../Model/CoinModel');
let UserModel = require('../../Model/UserModel');
let AssetsModel = require('../../Model/AssetsModel');

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
    let isRun = false;
    var job = schedule.scheduleJob('*/15 * * * * *',async()=>{
        if(isRun){
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if(!coinList){
            isRun = false;
            return;
        }

        let res = await Promise.all(coinList.map(async(coin)=>{
            try{
                let userCount = await UserModel.getUserCount();
                let userCountByCoinId = await AssetsModel.getUserCountByCoinId(coin.coin_id);
                if(userCount <= userCountByCoinId){
                    return;
                }
                let pageSize = 500;
                let pageCount = Math.ceil(userCount / pageSize);

                for(let page = 1; page <= pageCount; page++){
                    let userList = await UserModel.getUserList(page,pageSize);
                    if(!userList || !userList.list || !userList.list.length){
                        return;
                    }
                    let list = await Promise.all(userList.list.map(async(item)=>{
                        let count = await AssetsModel.getUserCountByUserIdCoinId(item.user_id,coin.coin_id);
                        if(count == 0){
                            return item;
                        }
                    }));
                    let result = await AssetsModel.insertUserAssets(list,coin.coin_id);

                }
            }catch(error){
                console.error(error);
            }
            return;
        }));    
        isRun = false;
    })    
}catch(error){
    isRun = false;
    throw error;
}