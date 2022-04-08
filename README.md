# Observable Entropy Worker

## What is Observable Entropy?

Please take a look at the
[Observable Entropy README](https://github.com/truestamp/observable-entropy#readme)
to learn more about the larger project and its goals. This repository only contains the REST API component of that project.

## About this Code

This [Cloudflare Worker](https://workers.cloudflare.com/) provides the HTTP REST API that accesses data stored in
the main Github repository. It is implemented using the
[WorkTop](https://github.com/lukeed/worktop) API framework. It provides a
transparent proxy to the raw data stored in GitHub, and also uses
[Cloudflare Workers KV](https://www.cloudflare.com/products/workers-kv/) to
store the latest entropy data for lightning fast access worldwide.

There is a [public website](https://observable-entropy.truestamp.com) that draws
its data continuously, in near real-time, from this API. The website displays the current entropy value, the time it was last updated,
and the current system time of the viewer.

## Related Repositories

- [truestamp/observable-entropy](https://github.com/truestamp/observable-entropy#readme)
- [truestamp/observable-entropy-worker](https://github.com/truestamp/observable-entropy-worker)
- [truestamp/observable-entropy-nextjs](https://github.com/truestamp/observable-entropy-nextjs)

## HTTP API Usage Examples

### Retrieve the `ed25519` public key used for verifying the `hash` `signature` of captured entropy

`https://entropy.truestamp.com/pubkey`

```sh
❯ http https://entropy.truestamp.com/pubkey

{
    "key": "2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26"
}
```

### Retrieve the latest entropy file

`https://entropy.truestamp.com/latest`

```sh
$ http https://entropy.truestamp.com/latest

{
    "createdAt": "2022-04-08T20:00:21.773Z",
    "files": [
        {
            "hash": "b4c8893daa20a5022bd745a44de76ea4f958fa59954b284aa9c8b124d21f6bea",
            "hashType": "sha256",
            "name": "bitcoin.json"
        },
        {
            "hash": "9c1fc63967bb1499b40ed90eb90d28bba66e9bbac2921db2a2e33cbcd91d2229",
            "hashType": "sha256",
            "name": "drand-beacon.json"
        },
        {
            "hash": "027ba201dbd00f5477d65d1d27c9c7556206bb99c220d9d80d1d4139d81f4934",
            "hashType": "sha256",
            "name": "entropy_previous.json"
        },
        {
            "hash": "592b0e169347f62002dd40dcfcdc5ca7c02fcfc7550f768830af1354ea011eba",
            "hashType": "sha256",
            "name": "ethereum.json"
        },
        {
            "hash": "668f7e1aad603a3ba5055f1ca553be16032c1356d297ef82419c624fb9f15588",
            "hashType": "sha256",
            "name": "hacker-news.json"
        },
        {
            "hash": "dc3e6b6e40e36fb8ddc334df76ba25aba7e15840c1ea3c1e577a5bac6015f884",
            "hashType": "sha256",
            "name": "nist-beacon.json"
        },
        {
            "hash": "9bed75da68021979b9239d1b20de84e71624dce87f9cd67e46b41c26ff5070cd",
            "hashType": "sha256",
            "name": "stellar.json"
        },
        {
            "hash": "72e703eead2a323520cf2fb2666e5123bc0917041f5214ea0dbfce1ca1916541",
            "hashType": "sha256",
            "name": "timestamp.json"
        },
        {
            "hash": "2888750350b3b56433bd5ab042a8a36d5d5bf540410f19915eb54d5c855b0819",
            "hashType": "sha256",
            "name": "user-entropy.json"
        }
    ],
    "hash": "26f48ca59e89fed7e578058ab8447d1556e4463a165cd69f46ab11e42fa4b50d",
    "hashIterations": 500000,
    "hashType": "sha256",
    "prevHash": "8a319298ee97ba48216866cb3e646609c62c3b083d26621f851f2929d98df4bc",
    "signature": "4aeb600c40ab98ce99885fa01c86f8a557a6daeaeab135ae6bd1a93b10a863aebecc462c910aa12c9bad0765e887767ff1be774634be43dcce093bceb2ad380d"
}
```

### Retrieve an entropy file referenced by a specified Git commit ID

The `id` value in the URL is required to be a hex encoded SHA1 Git commit value
(20 bytes).

`https://entropy.truestamp.com/commit/:id`

```sh
$ http https://entropy.truestamp.com/commit/2b211c333108433458fb178c99fdefa6ed44710f

{
    "createdAt": "2021-06-28T16:56:54.665Z",
    "files": [
        {
            "hash": "6e4667b213601fed2fb0db76780ab5b3c16c2baeaa7a1f1448093fd954cdbb32",
            "hashType": "sha256",
            "name": "bitcoin.json"
        },
        {
            "hash": "788ce5580bb9312b6b7a279304678e33e5d24aa933ce8ee75eba6b50c6b7f48d",
            "hashType": "sha256",
            "name": "drand-beacon.json"
        },
        {
            "hash": "587d178ba17594ea91e21c064aad17f295f0ac3a0e498be37c468c312de096ce",
            "hashType": "sha256",
            "name": "entropy_previous.json"
        },
        {
            "hash": "c4576f8890501a50055bfcbadfca9e5149a63db56a2f674669d71be801cc7750",
            "hashType": "sha256",
            "name": "ethereum.json"
        },
        {
            "hash": "c7f95ae4a04e8a2999b5755cb2010df3f2883fa4e70a54b08d25877e360844f5",
            "hashType": "sha256",
            "name": "hacker-news.json"
        },
        {
            "hash": "cb5795939aad0c6d1ab2d610eb0d626a0afd01b11c1b074972db42da3f9064a2",
            "hashType": "sha256",
            "name": "nist-beacon.json"
        },
        {
            "hash": "9d6c9bf157e820d22fde67303ceffe4c36a80e6fa987db404f2b359e309495d4",
            "hashType": "sha256",
            "name": "stellar.json"
        },
        {
            "hash": "9c11f5239b1a4c3b85427ad791474a15131fec3d552e3aa07301c6af4612220b",
            "hashType": "sha256",
            "name": "timestamp.json"
        },
        {
            "hash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
            "hashType": "sha256",
            "name": "user-entropy.json"
        }
    ],
    "hash": "7c47473d33c55cae28fcd2e312551e31ec8752a734339802be29e5f85a02d876",
    "hashIterations": 500000,
    "hashType": "sha256",
    "prevHash": "a5a04c32a1af9d3442aef93fe5e194e207161ae5e30ae29db56d6b0c95911dcd"
}
```

### Retrieve an entropy file by its entropy `hash`

The index that maps an entropy `hash` to a specific Git commit ID is persisted
to a file in the `index` directory of the repository and committed. The `hash`
value in the URL is required to be a hex encoded SHA256 value (32 bytes).

`https://entropy.truestamp.com/hash/:hash`

```sh
$ http https://entropy.truestamp.com/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e

{
    "createdAt": "2021-09-29T02:31:33.671Z",
    "files": [
        {
            "hash": "cbe446cea5376c4d19447b9510d5b42d21d91dc8e87aaff98b9ddfbb14ab39b1",
            "hashType": "sha256",
            "name": "bitcoin.json"
        },
        {
            "hash": "1b2ba21e7028cc1d1afe6a1199eddcb52b30b7d11440a68f1d39a44cabf3453f",
            "hashType": "sha256",
            "name": "drand-beacon.json"
        },
        {
            "hash": "8864c3f0b37424cfafa8cd4552a31add13f74249fddf833a811a2cf8c31b8692",
            "hashType": "sha256",
            "name": "entropy_previous.json"
        },
        {
            "hash": "29015d82ec0302d022b7943d76c6ae611bab9ede30a9daef338695bcf9dd55ab",
            "hashType": "sha256",
            "name": "ethereum.json"
        },
        {
            "hash": "f024c6082ea9b8f244481d9dcb034a647b7bebdabcc767e275e6f18edb000574",
            "hashType": "sha256",
            "name": "hacker-news.json"
        },
        {
            "hash": "43f1cb1283a85e1592cb7a6eb03dfbb384b98265070c9fcd30bc9774bd5c65b4",
            "hashType": "sha256",
            "name": "nist-beacon.json"
        },
        {
            "hash": "0c2a3c7a993b6a5e7bfd5f3238c83acecef68792ddbf8bef5371dd853c4f1ae8",
            "hashType": "sha256",
            "name": "stellar.json"
        },
        {
            "hash": "edc508e569cd815983727418ee67d8fd32fee70b722f7dd68f39419fa5d330aa",
            "hashType": "sha256",
            "name": "timestamp.json"
        },
        {
            "hash": "498ca50ab1b22eb01c73569d8d8538c1f5e47f45d7a72bd72803a39a3206d8aa",
            "hashType": "sha256",
            "name": "user-entropy.json"
        }
    ],
    "hash": "605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e",
    "hashIterations": 500000,
    "hashType": "sha256",
    "prevHash": "bf07b4cef7a4872726d8ff45fafd37b6e23e23dd657171c898b3c775d43a5727",
    "signature": "95f109222277021dfe42fa82e21a63419d66ae0e4035f053739aedb45a9be1e4a937fc28ae6315455b990589b093e5e956221c6fb989aa8b161ddd0dedc2a107"
}
```

### Submit User Provided Entropy

```sh
$ http -v POST https://entropy.truestamp.com/entries entropy=bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342

{
    "entropy": "bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342",
    "expiration": 1649450191,
    "key": "entry::01G05CG9TV4XEKSYCZX7XKSNMR"
}
```

### Get User Provided Entropy

```sh
$ http https://entropy.truestamp.com/entries

[
    "bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342",
    "1ea59779a41ea0e906459fcc66a2caf06026ad3e7478447ea3c7c1b98c6c67c4",
    "bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342",
    "2bac2e7954a4d71de9a91fa131162f59799c88f4edb191c588b3faa2d0090656"
]
```

## Legal

Copyright © 2020-2022 Truestamp Inc. All rights reserved.
