const { expect } = require('chai');
const { LoadUtils } = require('../src/util/Injected/Utils');

describe('Injected sendMessage', function () {
    it('does not copy a media model private ID into the outgoing message', async function () {
        const previousWindow = global.window;
        let outgoingMessage;

        try {
            global.window = { require: () => null };
            LoadUtils();

            class MsgKey {
                constructor(data) {
                    Object.assign(this, data);
                    this._serialized = 'outgoing-message-id';
                }

                static async newId() {
                    return 'outgoing-message-id';
                }
            }

            const modules = {
                WAWebChatGetters: {
                    getIsNewsletter: () => false,
                    getIsBroadcast: () => false,
                },
                WALinkify: { findLink: () => null },
                WAWebUserPrefsMeUser: {
                    getMaybeMeLidUser: () => ({ id: 'me@lid' }),
                    getMaybeMePnUser: () => ({ id: 'me@c.us' }),
                },
                WAWebMsgKey: MsgKey,
                WAWebGetEphemeralFieldsMsgActionsUtils: {
                    getEphemeralFields: () => ({}),
                },
                WAWebSendMsgChatAction: {
                    addAndSendMsgToChat: (_chat, message) => {
                        outgoingMessage = message;
                        return [Promise.resolve(), Promise.resolve()];
                    },
                },
                WAWebCollections: { Msg: { get: () => outgoingMessage } },
            };
            window.require = (name) => modules[name];
            window.WWebJS.processMediaData = async () => ({
                __x_id: 'media-model-id',
                type: 'document',
                toJSON: () => ({ __x_id: 'media-json-id', mediaKey: 'key' }),
            });

            const chat = {
                id: {
                    isLid: () => false,
                    isGroup: () => false,
                    isStatus: () => false,
                },
            };
            await window.WWebJS.sendMessage(chat, '', { media: {} });

            expect(outgoingMessage.id).to.be.instanceOf(MsgKey);
            expect(outgoingMessage).not.to.have.property('__x_id');
            expect(outgoingMessage.mediaKey).to.equal('key');
        } finally {
            global.window = previousWindow;
        }
    });
});
