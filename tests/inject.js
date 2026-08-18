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
                        resolve(options);
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
        const options = await socketWaitStarted;

        expect(options.timeout).to.equal(0);
        expect(options.signal).to.be.an.instanceOf(AbortSignal);
        options.signal.throwIfAborted();
        client._injectAbort.abort();

        await injection;
    });

    it('deduplicates concurrent app-state synchronization', async function () {
        const client = new Client();
        let resolveAuthPayload;
        const authPayload = new Promise((resolve) => {
            resolveAuthPayload = resolve;
        });

        client.pupPage = {
            evaluate: sinon.stub().resolves(true),
        };
        sinon
            .stub(client.authStrategy, 'getAuthEventPayload')
            .returns(authPayload);
        const afterAuthReady = sinon.stub(
            client.authStrategy,
            'afterAuthReady',
        );
        const authenticated = sinon.spy();
        const ready = sinon.spy();
        client.on('authenticated', authenticated);
        client.on('ready', ready);

        const firstSync = client._onAppStateHasSynced('test-version');
        const secondSync = client._onAppStateHasSynced('test-version');
        resolveAuthPayload({});
        await Promise.all([firstSync, secondSync]);

        expect(authenticated.calledOnce).to.equal(true);
        expect(ready.calledOnce).to.equal(true);
        expect(afterAuthReady.calledOnce).to.equal(true);
    });
});
