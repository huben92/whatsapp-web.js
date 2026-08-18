const chai = require('chai');
const sinon = require('sinon');

const { Client } = require('..');

const expect = chai.expect;

describe('Client injection', function () {
    it('cancels the socket state wait when injection is superseded', async function () {
        const client = new Client();
        const socketWaitStarted = new Promise((resolve) => {
            client.pupPage = {
                waitForFunction: sinon.stub(),
            };

            client.pupPage.waitForFunction.onFirstCall().resolves();
            client.pupPage.waitForFunction.onSecondCall().callsFake(
                (_predicate, options) =>
                    new Promise((_resolve, reject) => {
                        resolve(options.signal);
                        options.signal.addEventListener(
                            'abort',
                            () => reject(options.signal.reason),
                            { once: true },
                        );
                    }),
            );
        });

        sinon.stub(client, 'setDeviceName').resolves();
        sinon.stub(client, 'getWWebVersion').resolves('test-version');

        const injection = client.inject();
        const signal = await socketWaitStarted;

        expect(signal).to.be.an.instanceOf(AbortSignal);
        signal.throwIfAborted();
        client._injectAbort.abort();

        await injection;
    });
});
