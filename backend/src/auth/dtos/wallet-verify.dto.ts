import { IsString, Matches } from 'class-validator';
import { STELLAR_PUBLIC_KEY_REGEX } from './wallet-challenge-request.dto';

export class WalletVerifyDto {
  @IsString()
  @Matches(STELLAR_PUBLIC_KEY_REGEX, {
    message: 'address must be a valid Stellar public key',
  })
  address: string;

  // Base64-encoded ed25519 signature of the challenge string, produced by
  // the wallet (e.g. StellarWalletsKit.signMessage).
  @IsString()
  signedChallenge: string;
}
