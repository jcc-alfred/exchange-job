let Web3 = require('web3');
let Tx = require('ethereumjs-tx');

class EthService{
    constructor(host,port,walletPassphrase){
        //let hostUrl = 'https://mainnet.infura.io/7cc86955d18e40f9902439589fa71a4d';
        // let hostUrl = 'https://rinkeby.infura.io/7cc86955d18e40f9902439589fa71a4d';
        //let hostUrl = 'http://' + host +':' + port;
        let hostUrl = host;
        this.web3 = new Web3(new Web3.providers.HttpProvider(hostUrl));
    }
    async toAscii(input){
        return this.web3.utils.toAscii(input);
    }

    async createAccount(){
        return this.web3.eth.accounts.create();
    }
    async getBlockNumber(){
        return this.web3.eth.getBlockNumber();
    }
    async getBlock(blockNumber){
        return this.web3.eth.getBlock(blockNumber);
    }
    async getTransaction(txid){
        return this.web3.eth.getTransaction(txid);
    }
    async getBalance(address){
        return this.web3.eth.getBalance(address);
    }
    async getGasPrice(){
        return this.web3.eth.getGasPrice();
    }
    async sendSignedTransaction(toAddress,tradeAmount,privateKey){
        let gasLimit = 21000;
        let gasLimitHex = this.web3.utils.toHex(gasLimit);
        let amountHex =  this.web3.utils.toHex(this.web3.utils.toWei(tradeAmount.toString(), 'ether'));
        let gasPrice = await this.web3.eth.getGasPrice();
        let gasPriceHex = this.web3.utils.toHex(parseInt(gasPrice)*5);
        let account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
        let nonce = await this.web3.eth.getTransactionCount(account.address);
        let nonceHex =  this.web3.utils.toHex(nonce);
        privateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        let privateKeyHex = new Buffer(privateKey, 'hex');
        let rawTx = {
            nonce:nonceHex,
            to: toAddress,
            value: amountHex,
            gasLimit: gasLimitHex,
            gasPrice: gasPriceHex
        };
        let tx = new Tx(rawTx);
        tx.sign(privateKeyHex);
        let serializedTx = tx.serialize();
        return this.web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
    }
    weiToEther(weiVal){
        return this.web3.utils.fromWei(weiVal.toString(),'ether');
    }
    hexToNumber(hexVal){
        return this.web3.utils.toBN(this.web3.utils.hexToNumberString(hexVal));
    }
    isAddress(address){
        return this.web3.utils.isAddress(address);
    }
    //ERC20 Token
    async getTokenBalance(blockAddress,contractAddress){
        var web3 = this.web3;
        let contractABI = [{
            "constant": true,
            "inputs": [
              {
                "name": "_owner",
                "type": "address"
              }
            ],
            "name": "balanceOf",
            "outputs": [
              {
                "name": "balance",
                "type": "uint256"
              }
            ],
            "payable": false,
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
              {
                "name": "_to",
                "type": "address"
              },
              {
                "name": "_value",
                "type": "uint256"
              }
            ],
            "name": "transfer",
            "outputs": [
              {
                "name": "success",
                "type": "bool"
              }
            ],
            "payable": false,
            "type": "function"
        }];
        let tokenContract = new web3.eth.Contract(contractABI,contractAddress);
        return tokenContract.methods.balanceOf(blockAddress).call();
    }
    async getTokenEstimateGas(toAddress,tradeAmount,privateKey,contractAddress,tokenDecimals){
        var web3 = this.web3;
        let contractABI = [{
            "constant": true,
            "inputs": [
              {
                "name": "_owner",
                "type": "address"
              }
            ],
            "name": "balanceOf",
            "outputs": [
              {
                "name": "balance",
                "type": "uint256"
              }
            ],
            "payable": false,
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
              {
                "name": "_to",
                "type": "address"
              },
              {
                "name": "_value",
                "type": "uint256"
              }
            ],
            "name": "transfer",
            "outputs": [
              {
                "name": "success",
                "type": "bool"
              }
            ],
            "payable": false,
            "type": "function"
        }];
        let tokenContract = new web3.eth.Contract(contractABI,contractAddress);
        let amountHex =  this.web3.utils.toHex(this.web3.utils.toWei(tradeAmount.toString(), 'ether'));
        let transferABI = tokenContract.methods.transfer(toAddress, amountHex).encodeABI();
        let gasPrice = await web3.eth.getGasPrice();
        let gasPriceHex = web3.utils.toHex(web3.utils.toBN(gasPrice));
        let account = web3.eth.accounts.privateKeyToAccount(privateKey);
        let nonce = await web3.eth.getTransactionCount(account.address);
        // let nonceHex =  web3.utils.toHex(nonce);
        privateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        let privateKeyHex = new Buffer(privateKey, 'hex');
        var rawTx = {
            to: contractAddress,
            value: '0x0',
            from:account.address,
            // nonce:nonceHex,
           gasPrice: gasPriceHex,
            data: transferABI
        };
        return web3.eth.estimateGas(rawTx);
    }
    async sendTokenSignedTransaction(toAddress,tradeAmount,privateKey,contractAddress,tokenDecimals){
        var web3 = this.web3;
        let contractABI = [{
            "constant": true,
            "inputs": [
              {
                "name": "_owner",
                "type": "address"
              }
            ],
            "name": "balanceOf",
            "outputs": [
              {
                "name": "balance",
                "type": "uint256"
              }
            ],
            "payable": false,
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
              {
                "name": "_to",
                "type": "address"
              },
              {
                "name": "_value",
                "type": "uint256"
              }
            ],
            "name": "transfer",
            "outputs": [
              {
                "name": "success",
                "type": "bool"
              }
            ],
            "payable": false,
            "type": "function"
        }];
        let tokenContract = new web3.eth.Contract(contractABI,contractAddress);
        let amountHex =  this.web3.utils.toHex(this.web3.utils.toWei(tradeAmount.toString(), 'ether'));
        let transferABI = tokenContract.methods.transfer(toAddress, amountHex).encodeABI();
        let gasPrice = await web3.eth.getGasPrice();
        let gasPriceHex = web3.utils.toHex(gasPrice);
        let account = web3.eth.accounts.privateKeyToAccount(privateKey);
        let nonce = await web3.eth.getTransactionCount(account.address);
        let nonceHex =  this.web3.utils.toHex(nonce);
        privateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        let privateKeyHex = new Buffer(privateKey, 'hex');
        var rawTx = {
            to: contractAddress,
            value: '0x0',
            gasPrice: gasPriceHex,
            from:account.address,
            nonce:nonceHex,
            data: transferABI
        };
        let gasLimit = await web3.eth.estimateGas(rawTx);
        let gasLimitHex = web3.utils.toHex(gasLimit);
        rawTx.gasLimit = gasLimitHex;
        let tx = new Tx(rawTx);
        tx.sign(privateKeyHex);
        let serializedTx = tx.serialize();
        return web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
    }
}

module.exports = EthService;


// a= new EthService();
// console.log(a.toAscii('0xa9059cbb000000000000000000000000c2f24c45a2dea5af655f6b5443c499cbd79d337700000000000000000000000000000000000000000000000000000000cc532100'))