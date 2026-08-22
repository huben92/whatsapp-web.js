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

    it('retries page polling when navigation destroys an execution context', async function () {
        const client = new Client();
        client.pupPage = {
            evaluate: sinon
                .stub()
                .onFirstCall()
                .rejects(new Error('Execution context was destroyed'))
                .onSecondCall()
                .resolves(true),
            isClosed: sinon.stub().returns(false),
        };
        client.pupBrowser = {
            isConnected: sinon.stub().returns(true),
        };

        const result = await client._pollPage(
            () => true,
            new AbortController().signal,
            2000,
        );

        expect(result).to.equal(true);
        expect(client.pupPage.evaluate.calledTwice).to.equal(true);
    });

    it('stops app-state setup when its injection is cancelled', async function () {
        const client = new Client();
        let resolveAuthPayload;
        const authPayload = new Promise((resolve) => {
            resolveAuthPayload = resolve;
        });
        const abort = new AbortController();
        client.pupPage = {
            evaluate: sinon.stub(),
        };
        sinon
            .stub(client.authStrategy, 'getAuthEventPayload')
            .returns(authPayload);
        const attachEventListeners = sinon.stub(client, 'attachEventListeners');

        const setup = client._onAppStateHasSynced('test-version', abort.signal);
        abort.abort();
        resolveAuthPayload({});
        await setup;

        expect(client.pupPage.evaluate.called).to.equal(false);
        expect(attachEventListeners.called).to.equal(false);
    });

    it('marks a ready client unavailable and reinjects after navigation', async function () {
        const client = new Client();
        let onFrameNavigated;
        client.pupPage = {
            on: sinon.stub().callsFake((event, handler) => {
                if (event === 'framenavigated') onFrameNavigated = handler;
            }),
            isClosed: sinon.stub().returns(false),
        };
        client.pupBrowser = {
            isConnected: sinon.stub().returns(true),
        };
        client._readyEmitted = true;
        client._appStateSyncPromise = Promise.resolve();
        const reinject = sinon.stub(client, 'inject').resolves();
        const loading = sinon.spy();
        client.on('loading_screen', loading);

        client._registerFramenavigatedHandler();
        await onFrameNavigated({
            parentFrame: () => null,
            url: () => 'https://web.whatsapp.com/',
        });

        expect(client._readyEmitted).to.equal(false);
        expect(client._appStateSyncPromise).to.equal(null);
        expect(loading.calledOnceWith(0, 'WhatsApp')).to.equal(true);
        expect(reinject.calledOnce).to.equal(true);
    });
});
