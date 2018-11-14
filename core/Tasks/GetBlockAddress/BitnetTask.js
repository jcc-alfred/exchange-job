let schedule = require('node-schedule');
let BitnetService = require('../../Base/Crypto/BitnetService');
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
        let bitnetCoinList =  coinList.filter(coin => coin.coin_api_type_id == 1);
        if(!bitnetCoinList){
            isRun = false;
            return;
        }
        bitnetCoinList.forEach(async(coin)=>{
            if(!coin.wallet_ip){
                return;
            }
            try{
                let bitnetService = new BitnetService(coin.wallet_ip,coin.wallet_port,coin.wallet_rpc_user,coin.wallet_rpc_pass,coin.wallet_passphrase);
                try{
                    let [netInfo] = await bitnetService.getNetworkInfo();
                    if(!netInfo || !netInfo.connections){
                        return;
                    }
                }catch(error){
                    return;
                }
                let userCount = await AssetsModel.getUserCountByCoinId(coin.coin_id);
                let pageSize = 500;
                let pageCount = Math.ceil(userCount / pageSize);

                for(let page = 1; page <= pageCount; page++){
                    let assetsList = await AssetsModel.getEmptyAssetsByCoinId(coin.coin_id,page,pageSize);
                    if(!assetsList|| !assetsList.list || !assetsList.list.length){
                        return;
                    }
                    assetsList.list.forEach (async (item) =>{
                            try{
                                let address = await bitnetService.getAccountAddress(item.user_id);
                                if(Array.isArray(address) && address.length > 0 && address[0] && address[0].length < 100){
                                    //修改数据库
                                    await AssetsModel.setBlockAddress({userId:item.user_id,coinId:item.coin_id,blockAddress:address[0],privateKey:''});
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
    console.error(error);
}


