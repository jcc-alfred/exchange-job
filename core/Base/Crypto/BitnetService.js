let BitnetClient = require('bitcoin-core');

class BitnetService{
    constructor(host,port,username,password,walletPassphrase){
        this.walletPassphrase = walletPassphrase;
        this.bitnetClient = new BitnetClient({host:host,port:port,username:username,password:password});
    }
    async getNetworkInfo(){
        return this.bitnetClient.command([
            {
                method:'getnetworkinfo',
                parameters:[]
            }
        ]);
    }
    async getAccountAddress(account){
        return this.bitnetClient.command([
            {
                method:'getnewaddress',
                parameters:[account.toString()]
            }
        ]);
    }
    async listTransactions(count = 10000){
        return this.bitnetClient.command([
            {
                method:'listtransactions',
                parameters:['*',count]
            }
        ]);
    }
    async getTransaction(txid){
        return this.bitnetClient.command([
            {
                method:'gettransaction',
                parameters:[txid]
            }
        ]);
    }
    async WalletLock(){
        return this.bitnetClient.command([
            {
                method:'walletlock',
                parameters:[]
            }
        ]);
    }
    async WalletPassphrase(timeout=100){
        return this.bitnetClient.command([
            {
                method:'walletpassphrase',
                parameters:[this.walletPassphrase,timeout]
            }
        ]);
    }
    async getBalance(){
        return this.bitnetClient.command([
            {
                method:'getbalance',
                parameters:[]
            }
        ]);
    }
    async sendMany(txList){
        return this.bitnetClient.command([
            {
                method:'sendmany',
                parameters:['',txList]
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
        return this.bitnetClient.command([
            {
                method:'validateaddress',
                parameters:[address]
            }
        ]);
    }
}

module.exports = BitnetService;