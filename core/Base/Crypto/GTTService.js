let rp = require('request-promise');

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
}

module.exports = GTTService;