let schedule = require('node-schedule');
let CryptoUtils = require('../../Base/Utils/CryptoUtils');
let EthService = require('../../Base/Crypto/EthService');
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

try {
    let isRun = false;
    var job = schedule.scheduleJob('*/15 * * * * *', async () => {
        if (isRun) {
            return;
        }
        isRun = true;
        let coinList = await CoinModel.getCoinList();
        if (!coinList) {
            isRun = false;
            return;
        }
        let gtbList = coinList.filter(coin => coin.coin_api_type_id == 6);
        if (!gtbList) {
            isRun = false;
            return;
        }
        gtbList.forEach(async (coin) => {
            if (!coin.wallet_ip) {
                return;
            }
            try {
                let ethService = new EthService(coin.wallet_ip, coin.wallet_port, coin.wallet_passphrase);
                let userCount = await AssetsModel.getUserCountByCoinId(coin.coin_id);
                let pageSize = 500;
                let pageCount = Math.ceil(userCount / pageSize);
                for (let page = 1; page <= pageCount; page++) {
                    let assetsList = await AssetsModel.getEmptyAssetsByCoinId(coin.coin_id, page, pageSize);
                    if (!assetsList || !assetsList.list || !assetsList.list.length) {
                        return;
                    }
                    assetsList.list.forEach(async (item) => {
                        try {
                            let account = await ethService.createAccount();
                            if (account && account.address && account.privateKey) {
                                let privateKey = CryptoUtils.aesEncode(account.privateKey);
                                //修改数据库
                                await AssetsModel.setBlockAddress({
                                    userId: item.user_id,
                                    coinId: item.coin_id,
                                    blockAddress: account.address,
                                    privateKey: privateKey
                                });
                            }
                        } catch (error) {
                            console.error(error);
                        }
                    });
                }

            } catch (error) {
                console.error(error);
            }
        });
        isRun = false;
    });
} catch (error) {
    isRun = false;
    throw error;
}


