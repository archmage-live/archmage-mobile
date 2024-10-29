export interface SigningWallet {
  address: string
  privateKey?: string
  publicKey?: string

  signTransaction(transaction: any, ...args: any[]): Promise<any>

  signMessage(message: any): Promise<any>

  signTypedData(typedData: any): Promise<any>
}

export interface KeystoreSigningWallet extends SigningWallet {
  privateKey: string
  publicKey: string

  derive(
    pathTemplate: string,
    index: number,
    derivePosition?: DerivePosition
  ): Promise<SigningWallet>
}


