const rp = require('request-promise');
const crypto = require('crypto');
const web3 = require('web3');
// const querystring = require('querystring');

class GTHService {
    constructor(host) {
        this.client = rp.defaults({
            baseUrl: host
        });
        this.transactionFee=0.01;
    }

    async createAccount(address, secret) {
        return this.client({
            method: 'POST',
            uri: '/wallet/create',
            form: {
                walletAddr: address,
                hashKey: secret
            }
        });
    }

    async getBlockNumber() {
        let res= await this.client({
            method: 'GET',
            uri: '/transaction/getBlockNumber',
            json:true
        });
        return res.data
    }

    async getTransactionFromBlock(block) {
        let res= await this.client({
            method: 'GET',
            uri: '/transaction/history/after-block',
            qs: {
                blockNumber: block,
                tokenName:'GTH'
            },
            json: true
        });
        return res.data
    }

    async getBalance(address) {
        let walletBalance = await this.client({
            method: 'GET',
            uri: '/wallet/balance',
            qs: {
                'walletAddr': address
            },
            json: true
        });

        return walletBalance.data.find(b => b.token == 'GTH').balance;
    }

    async getTransaction(id) {
        let res= await this.client({
            method: 'GET',
            uri: '/transaction/get-by-id',
            qs: {
                id: id
            },
            json: true
        });
        return res.data
    }

    async sendSignedTransaction(fromAddress, toAddress, amount, secret,tokenName='GTH') {
        const body = {
            tokenName:tokenName,
            from:fromAddress,
            to:toAddress,
            value:amount-this.transactionFee,
            note: 'asiaedx.com'
        };
        // const payload = querystring.stringify(body);
        const payload =
            "tokenName=" + body.tokenName + "&"+
            "from=" + body.from + "&" +
            "to=" + body.to + "&" +
            "value=" + body.value + "&" +
            "note=" + body.note;

        const signature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        body.signature = signature;

        let res =  await this.client({
            method: 'POST',
            url: '/transaction/transfer',
            form: body,
            json: true
        });
        return res.data
    }

    isAddress(address) {
        return web3.utils.isAddress(address);
    }
}

module.exports = GTHService;