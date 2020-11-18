let {numberToHex} = require("../packages/web3-utils");
let chai = require('chai');
let assert = chai.assert;
let Basic = require('./sources/Basic');
let Child = require('./sources/Child');
let Parent = require('./sources/Parent');
let utils = require('./helpers/test.utils');
let Web3 = utils.getWeb3();
let Method = require('../packages/web3-core-method');
let FakeIpcProvider = require('./helpers/FakeIpcProvider');
let Eth = require('../packages/web3-eth');
let formatters = require('../packages/web3-core-helpers/src/formatters.js');


describe('reorganization', function () {
    // `getPastEvents` not working with Geth instamine over websockets.
    if (process.env.GETH_INSTAMINE) return;

    let web3;
    let accounts;
    let basic;
    let instance;
    let port;

    let basicOptions = {
        data: Basic.bytecode,
        gasPrice: '1',
        gas: 4000000
    };

    beforeEach(async function () {
        port = utils.getWebsocketPort();

        web3 = new Web3('ws://localhost:' + port);
        accounts = await web3.eth.getAccounts();

        basic = new web3.eth.Contract(Basic.abi, basicOptions);
        instance = await basic.deploy().send({from: accounts[0]});
    });

    it('should confirmation number correct when reorg', function (done) {
        return new Promise(async (resolve, reject) => {

            let startBlock = await web3.eth.getBlockNumber();

            console.log("start block", startBlock);

            await instance
                .methods
                .setValue('1')
                .send({from: accounts[0]})
                .on('confirmation', async (number, receipt) => {
                    let currentBlock = await web3.eth.getBlockNumber();
                    assert.strictEqual(currentBlock - receipt["blockNumber"], number);
                    if (number === 1) {
                        done();
                    }
                });

            // Necessary for instamine, should not interfere with automine.
            await utils.mine(web3, accounts[0]);
        });
    });


    it('should transactionBlockTimeout handle reorg', function (done) {
        let notFailOnTimeoutWithReorg = function () {
            let provider = new FakeIpcProvider();
            let eth = new Eth(provider);
            let method = new Method({
                name: 'sendTransaction',
                call: 'eth_sendTransaction',
                params: 1,
                inputFormatter: [formatters.inputTransactionFormatter]
            });
            method.setRequestManager(eth._requestManager, eth);

            // generate send function
            let send = method.buildCall();

            // add results
            provider.injectValidation(function (payload) {
                assert.equal(payload.method, 'eth_sendTransaction');
                assert.deepEqual(payload.params, [{
                    from: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
                    to: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
                    value: '0xa',
                    gasPrice: "0x574d94bba"
                }]);
            });
            provider.injectResult('0x1234567453543456321456321'); // tx hash

            provider.injectValidation(function (payload) {
                assert.equal(payload.method, 'eth_getTransactionReceipt');
            });
            provider.injectResult(null);

            provider.injectValidation(function (payload) {
                assert.equal(payload.method, 'eth_subscribe');
                assert.deepEqual(payload.params, ['newHeads']);
            });
            provider.injectResult('0x1234567'); // subscription id

            // fire 50 fake newBlocks
            let i = 0;
            for (i = 0; i < 52; i++) {
                setTimeout(function () {
                    provider.injectNotification({
                        method: 'eth_subscription',
                        params: {
                            subscription: '0x1234567',
                            result: {
                                // reorg at block height 40,
                                // so that the result height of blocks with no receipt is actually 49, not 50,
                                // so this should not lead to block timeout
                                blockNumber: i < 40 ? numberToHex(i) : numberToHex(i + 1)
                            }
                        }
                    });
                }, i);

                // receipt
                provider.injectValidation(function (payload) {
                    // assert.equal(payload.method, 'eth_unsubscribe');
                    // assert.deepEqual(payload.params, ['0x1234567']);
                    /* OR */
                    // assert.equal(payload.method, 'eth_getTransactionReceipt');
                    // assert.deepEqual(payload.params, ['0x1234567453543456321456321']);
                });
                if (i + 1 >= 52) {
                    // inject receipt at the last fake block
                    provider.injectResult({
                        contractAddress: "0x1234567890123456789012345678901234567891",
                        cumulativeGasUsed: '0xa',
                        transactionIndex: '0x3',
                        blockNumber: '0xa',
                        blockHash: '0xafff',
                        gasUsed: '0x0'
                    });
                } else {
                    provider.injectResult(null);
                }
            }


            provider.injectValidation(function (payload) {
                assert.equal(payload.method, 'eth_unsubscribe');
                assert.deepEqual(payload.params, ['0x1234567']);
            });
            provider.injectResult(true); // unsubscribe result

            return send;

        };

        let send = notFailOnTimeoutWithReorg();

        let promiEvent = send({
            from: '0x11f4d0A3c12e86B4b5F39B213F7E19D048276DAe',
            to: '0x11f4d0A3c12e86B4b5F39B213F7E19D048276DAe',
            value: '0xa',
            gasPrice: '23435234234'
        });
        promiEvent
            .on("error", error => {
                assert.equal(error, undefined, "there should not an error, since reorg happens and should not be a block timeout.");
                done();
            })
            .on("receipt", receipt => {
                console.log(receipt)
                done();
            })
    });
});
