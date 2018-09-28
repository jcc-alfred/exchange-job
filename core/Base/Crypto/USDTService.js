let USDTClient = require('bitcoin-core');

class USDTService{
    constructor(host,port,username,password,walletPassphrase){
        this.walletPassphrase = walletPassphrase;
        this.usdtClient = new USDTClient({host:host,port:port,username:username,password:password});
    }
    async getAccountAddress(account){
        return this.usdtClient.command([
            {
                method:'getnewaddress',
                parameters:[account.toString()]
            }
        ]);
    }
    async listTransactions(count = 10000){
        return this.usdtClient.command([
            {
                method:'listtransactions',
                parameters:['*',count]
            }
        ]);
    }
    async omniListTransactions(count = 10000){
        return this.usdtClient.command([
            {
                method:'omni_listtransactions',
                parameters:['*',count]
            }
        ]);
    }
    async getTransaction(txid){
        return this.usdtClient.command([
            {
                method:'gettransaction',
                parameters:[txid]
            }
        ]);
    }
    async omniGetTransaction(txid){
        return this.usdtClient.command([
            {
                method:'omni_gettransaction',
                parameters:[txid]
            }
        ]);
    }
    async WalletLock(){
        return this.usdtClient.command([
            {
                method:'walletlock',
                parameters:[]
            }
        ]);
    }
    async WalletPassphrase(timeout=100){
        return this.usdtClient.command([
            {
                method:'walletpassphrase',
                parameters:[this.walletPassphrase,timeout]
            }
        ]);
    }
    async getBTCBalanceByAddress(address){
        let account = await this.usdtClient.command([
            {
                method:'getaccount',
                parameters:[address]
            }
        ]);
        return this.usdtClient.command([
            {
                method:'getbalance',
                parameters:[account]
            }
        ]);
    }
    async getBalance(){
        return this.usdtClient.command([
            {
                method:'getbalance',
                parameters:[]
            }
        ]);
    }
    async omniGetBalance(address){
        return this.usdtClient.command([
            {
                method:'getbalance',
                parameters:[address,31]
            }
        ]);
    }
    async omniSend(fromAddress,toAddress,amount){
        return this.usdtClient.command([
            {
                method:'omni_send',
                parameters:[fromAddress,toAddress,31,amount]
            }
        ]);
    }
    async sendToAddress(address,amount){
        return this.bitnetClient.command([
            {
                method:'sendtoaddress',
                parameters:[address,amount]
            }
        ]);
    }
    async validateAddress(address){
        return this.usdtClient.command([
            {
                method:'validateaddress',
                parameters:[address]
            }
        ]);
    }
}

module.exports = USDTService;