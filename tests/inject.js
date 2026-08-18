const chai = require('chai');
const sinon = require('sinon');

const { Client } = require('..');

const expect = chai.expect;

describe('Client injection', function () {
    it('cancels socket state polling when injection is superseded', async function () {
        const client = new Client();
        let socketPollStarted;
        const pollStarted = new Promise((resolve) => {
            socketPollStarted = resolve;
        });
        client.pupPage = {
            evaluate: sinon.stub(),
        };
        client.pupPage.evaluate.onFirstCall().resolves(true);
        client.pupPage.evaluate.onSecondCall().callsFake(() => {
            socketPollStarted();
            return null;
        });

        sinon.stub(client, 'setDeviceName').resolves();
        sinon.stub(client, 'getWWebVersion').resolves('test-version');

        const injection = client.inject();
        await pollStarted;

        client._injectAbort.abort();

        await injection;
        expect(client.pupPage.evaluate.calledTwice).to.equal(true);
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
