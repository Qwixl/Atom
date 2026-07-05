import { decodeKeyPackage, encodeKeyPackage, type KeyPackage, type PrivateKeyPackage } from "ts-mls/keyPackage.js";
import { base64ToBytes, bytesToBase64 } from "./pairSession.js";

export interface SerializedKeyPackages {
  publicPackageB64: string;
  initPrivateKeyB64: string;
  hpkePrivateKeyB64: string;
  signaturePrivateKeyB64: string;
}

export function serializeKeyPackages(packages: {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}): SerializedKeyPackages {
  return {
    publicPackageB64: bytesToBase64(encodeKeyPackage(packages.publicPackage)),
    initPrivateKeyB64: bytesToBase64(packages.privatePackage.initPrivateKey),
    hpkePrivateKeyB64: bytesToBase64(packages.privatePackage.hpkePrivateKey),
    signaturePrivateKeyB64: bytesToBase64(packages.privatePackage.signaturePrivateKey),
  };
}

export function deserializeKeyPackages(wire: SerializedKeyPackages): {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
} {
  const publicDecoded = decodeKeyPackage(base64ToBytes(wire.publicPackageB64), 0);
  if (!publicDecoded) {
    throw new Error("Invalid persisted MLS public key package");
  }
  return {
    publicPackage: publicDecoded[0],
    privatePackage: {
      initPrivateKey: base64ToBytes(wire.initPrivateKeyB64),
      hpkePrivateKey: base64ToBytes(wire.hpkePrivateKeyB64),
      signaturePrivateKey: base64ToBytes(wire.signaturePrivateKeyB64),
    },
  };
}
