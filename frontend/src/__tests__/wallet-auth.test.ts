import { post } from '../services/api';
import { requestWalletChallenge, verifyWalletChallenge } from '../services/wallet-auth';

jest.mock('../services/api', () => ({
  post: jest.fn(),
}));

const mockedPost = post as jest.Mock;

describe('wallet-auth service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests a challenge for the given address', async () => {
    mockedPost.mockResolvedValueOnce({ challenge: 'nonce-123', expiresIn: 300 });

    const result = await requestWalletChallenge('GABC');

    expect(mockedPost).toHaveBeenCalledWith('/auth/challenge', { address: 'GABC' });
    expect(result).toEqual({ challenge: 'nonce-123', expiresIn: 300 });
  });

  it('verifies a signed challenge and returns tokens', async () => {
    mockedPost.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const result = await verifyWalletChallenge('GABC', 'c2lnbmF0dXJl');

    expect(mockedPost).toHaveBeenCalledWith('/auth/verify', {
      address: 'GABC',
      signedChallenge: 'c2lnbmF0dXJl',
    });
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });
});
