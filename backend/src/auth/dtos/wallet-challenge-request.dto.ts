import { IsString, Matches } from 'class-validator';

// Stellar ed25519 public keys are 56-character base32 strings starting with "G".
export const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export class WalletChallengeRequestDto {
  @IsString()
  @Matches(STELLAR_PUBLIC_KEY_REGEX, {
    message: 'address must be a valid Stellar public key',
  })
  address: string;
}
