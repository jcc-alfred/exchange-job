const rp = require('request-promise');
const crypto = require('crypto');
const web3 = require('web3');
const querystring = require('querystring');

class GTTService {
    constructor(host) {
        this.client = rp.defaults({
            baseUrl: host
        });
    }

    async createAccount(address, secret) {
        return this.client({
            method: 'POST',
            uri: '/api/user',
            form: {
                address: address,
                secret: secret
            }
        });
    }

    async getBlockNumber() {
        return this.client({
            method: 'GET',
            uri: '/api/getBlockNumber'
        });
    }

    async getTransactionFromBlock(block) {
        return this.client({
            method: 'GET',
            uri: '/api/getTransactionFromBlock',
            qs: {
                blockNumber: block
            },
            json: true
        });
    }

    async getBalance(address) {
        return this.client({
            method: 'GET',
            uri: '/balance',
            headers: {
                'User-ID': address
            },
            json: true
        });
    }

    async getTransaction(id) {
        return this.client({
            method: 'GET',
            uri: '/getTransaction',
            qs: {
                id: id
            },
            json: true
        });
    }

    async sendSignedTransaction(fromAddress, toAddress, amount, secret) {
        const body = {
            fromAddress,
            toAddress,
            amount,
            remarks: 'asiaedx.com'
        };
        const payload = querystring.stringify(body);
        const signature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        body.signature = signature;

        return this.client({
            method: 'POST',
            url: '/api/transfer',
            form: body,
            json: true
        });
    }

    isAddress(address) {
        return web3.utils.isAddress(address);
    }
}

module.exports = GTTService;