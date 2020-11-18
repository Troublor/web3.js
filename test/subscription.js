const Web3 = require("web3");

(async () => {
    const provider = new Proxy(new Web3.providers.HttpProvider("http://localhost:8545"), {
        get: function (obj, prop) {
            if (prop === "send") {
                return new Proxy(obj[prop], {
                    apply: function (target, that, args) {
                        console.log("send JSON-RPC:", args[0]);
                        args[1] = new Proxy(args[1], {
                            apply(target, thisArg, argArray) {
                                console.log("JSON-RPC result:", argArray);
                                target.apply(thisArg, argArray);
                            }
                        })
                        target.apply(that, args);
                    }
                });
            }
            return obj[prop];
        }
    })
    const web3 = new Web3(provider);
    const from = "0xBB2eEF15D66a1BcE7Ad71dD31378a093f5A8a1ba";
    const to = "0xBB2eEF15D66a1BcE7Ad71dD31378a093f5A8a1ba";

    web3.eth.transactionConfirmationBlocks = 3;

    const promiEvent = web3.eth.sendTransaction({
        from: from,
        to: to,
    })

    const handler = (confirmNum) => {
        console.log("confirmation number", confirmNum);
        promiEvent.removeAllListeners("confirmation");
    }

    promiEvent
        .on("receipt", receipt => {
            console.log("receipt:", receipt)
        })
        .on("confirmation", handler);
})();

// describe("confirmation event", () => {
//     let server;
//     let web3;
//
//
//     beforeEach(async () => {
//         server = ganache.server({
//             blockTime: 1,
//             accounts: [
//                 {
//                     secretKey: "0x6ca6334a21f14ad5c3c06f3797d9a52c483d34e856badbe057f91b435342be88",
//                     balance: "0x56BC75E2D63100000"
//                 }
//             ]
//         });
//         return new Promise(resolve => {
//             server.listen(8545, resolve);
//         });
//     });
//
//     afterEach(async () => {
//         return new Promise(resolve => {
//             server.close(resolve);
//         });
//     })
//
//     it('should unsubscribe polling when listener is removed', function () {
//
//     });
// })
