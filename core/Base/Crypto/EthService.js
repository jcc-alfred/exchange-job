let Web3 = require('web3');
let Tx = require('ethereumjs-tx');
let EthereumTx = require('ethereumjs-tx').Transaction;


class EthService {
    constructor(host, port, walletPassphrase) {
        // let hostUrl = 'https://mainnet.infura.io/7cc86955d18e40f9902439589fa71a4d';
        //let hostUrl = 'https://rinkeby.infura.io/7cc86955d18e40f9902439589fa71a4d';
        //let hostUrl = 'http://' + host +':' + port;
        let hostUrl = host;
        this.web3 = new Web3(new Web3.providers.HttpProvider(hostUrl));
    }

    async createAccount() {
        return this.web3.eth.accounts.create();
    }

    async getBlockNumber() {
        return this.web3.eth.getBlockNumber();
    }

    async getBlock(blockNumber) {
        return this.web3.eth.getBlock(blockNumber);
    }

    async getTransaction(txid) {
        return this.web3.eth.getTransaction(txid);
    }
    async getBalance(address){
        return this.web3.eth.getBalance(address);
    }
    async getGasPrice(){
        return this.web3.eth.getGasPrice();
    }
    async sendSignedTransaction(fromAddress,toAddress,tradeAmount,privateKey){
        let gasLimit = 21000;
        let gasLimitHex = this.web3.utils.toHex(gasLimit);
        let amountHex =  this.web3.utils.toHex(this.web3.utils.toWei(tradeAmount.toString(), 'ether'));
        let gasPrice = await this.web3.eth.getGasPrice();
        let gasPriceHex = this.web3.utils.toHex(gasPrice);
        let account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
        let nonce = await this.web3.eth.getTransactionCount(fromAddress);
        let nonceHex =  this.web3.utils.toHex(nonce);
        privateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        let privateKeyHex = new Buffer(privateKey, 'hex');
        let rawTx = {
            // chainId:1234,
            nonce:nonceHex,
            from:fromAddress,
            to: toAddress,
            value: amountHex,
            gasLimit: gasLimitHex,
            gasPrice: gasPriceHex
        };
        let tx = new EthereumTx(rawTx);
        tx.sign(privateKeyHex);
        let serializedTx = tx.serialize();
        let txObj= await this.web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
        console.log(txObj);
        return txObj
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
            to: toAddress,
            value: '0x0',
            gasPrice: gasPriceHex,
            gasLimit:await web3.utils.toHex(210000),
            from: fromAddress,
            nonce: nonceHex,
            data: transferABI
        };
        return web3.eth.estimateGas(rawTx);
    }

    async sendTokenSignedTransaction(fromAddress,toAddress, tradeAmount, privateKey, contractAddress, tokenDecimals,gas_to_use=21000) {
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
        // let account = web3.eth.accounts.privateKeyToAccount(privateKey);
        let tokenContract = new web3.eth.Contract(contractABI, contractAddress,{from: fromAddress});
        let amountHex = this.web3.utils.toHex(tradeAmount* 10**tokenDecimals );
        let transferABI = tokenContract.methods.transfer(toAddress, amountHex).encodeABI();
        let gasPrice = await web3.eth.getGasPrice();
        let gasPriceHex = web3.utils.toHex(gasPrice);
        let nonce = await web3.eth.getTransactionCount(fromAddress);
        let nonceHex = this.web3.utils.toHex(nonce);
        privateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        let privateKeyHex = new Buffer(privateKey, 'hex');
        var rawTx = {
            to: contractAddress,
            value: '0x0',
            gasPrice: gasPriceHex,
            from:fromAddress,
            nonce:nonceHex,
            gasLimit:await web3.utils.toHex(210000),

            data: transferABI
        };
        let tx = new EthereumTx(rawTx);
        tx.sign(privateKeyHex);
        let serializedTx = tx.serialize();
        let txObj=  await web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
        console.log(txObj);
        return txObj
    }
}

module.exports = EthService;



let a= new EthService('https://mainnet.infura.io/v3/9552ac202e2c4dfb9f1a986b71d86d4a');
//send eth
// let b =  a.sendSignedTransaction('0xD6952dd30A4f699213F60386C7c45EB2801a7509','0xa043464d5f839a3c02100fdd1942ac78def26c68',0.0003289,'ed9686e8b7d6226a16575d1ab77ae8a26dca69b1bd71cc268add8bbe37df2b09')

//send usdt
let bb = a.sendTokenSignedTransaction('0xD6952dd30A4f699213F60386C7c45EB2801a7509','0xa043464d5f839a3c02100fdd1942ac78def26c68',1,'ed9686e8b7d6226a16575d1ab77ae8a26dca69b1bd71cc268add8bbe37df2b09','0xdAC17F958D2ee523a2206206994597C13D831ec7',6)
//
//
//
// let c = new EthService('http://api.gttdollar.com:8545');
// let d = c.sendSignedTransaction('0xaAE49899140752c66E571f0c0bcdEA78b31162af',0.1,'d0d1c605f06f1e69113218114b1576048061704410a525245d438531b64fe95f');
//0x4A1E34E32e7588D3cf26d8Ec971ACA5f60EB0e69