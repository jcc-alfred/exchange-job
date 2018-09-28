let schedule = require('node-schedule');
let CoinModel = require('../../Model/CoinModel');
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
        let erc20List =  coinList.filter(coin => coin.coin_api_type_id == 3);
        if(!erc20List){
            isRun = false;
            return;
        }
        erc20List.forEach(async(coin)=>{
            if(!coin.wallet_ip){
                return;
            }
            try{
                let userCount = await AssetsModel.getEmptyAddrUserCountByCoinId(coin.coin_id);
                let pageSize = 500;
                let pageCount = Math.ceil(userCount / pageSize);

                for(let page = 1; page <= pageCount; page++){
                    let assetsList = await AssetsModel.getEmptyAssetsByCoinId(coin.coin_id,page,pageSize);
                    if(!assetsList|| !assetsList.list || !assetsList.list.length){
                        return;
                    }
                    assetsList.list.forEach (async (item) =>{
                            try{
                                let [ethCoin] = coinList.filter(coin => coin.coin_api_type_id == 2);
                                let [ethAssetsItem] = await AssetsModel.getUserAssetsByUserIdCoinId(item.user_id,ethCoin.coin_id);
                                if(ethAssetsItem && ethAssetsItem.block_address && ethAssetsItem.private_key){
                                    let blockAddress = await ethAssetsItem.block_address;
                                    let privateKey = await ethAssetsItem.private_key;
                                    //修改数据库
                                    await AssetsModel.setBlockAddress({userId:item.user_id,coinId:item.coin_id,blockAddress:blockAddress,privateKey:privateKey});
                                }
                                
                            }catch(error){
                                console.error(error);
                            }
                        });
                }
                
            }catch(error){
                console.error(error);
            }
        });    
        isRun = false;
    }); 
}catch(error){
    isRun = false;
    throw error;
}


