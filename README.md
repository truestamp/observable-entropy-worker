# Observable Entropy Worker

A Cloudflare worker proxy that retrieves the transparent and verifiable entropy stored in the [truestamp/observable-entropy](https://github.com/truestamp/observable-entropy) repository.

## Examples

### Retrieve the `ed25519` public key used for verifying the `hash` `signature`

`https://entropy.truestamp.com/pubkey`

```sh
❯ http https://entropy.truestamp.com/pubkey                                                               

{
    "key": "2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26"
}
```

### Retrieve the latest entropy file

`https://entropy.truestamp.com/latest`.

```sh
$ http https://entropy.truestamp.com/latest

{
    "createdAt": "2021-06-28T17:38:30.860Z",
    "files": [
        {
            "hash": "b54ec694d96aebcc32a61c010fa88dc10a6f8adc6f419b32e05db81d0378c91a",
            "hashType": "sha256",
            "name": "bitcoin.json"
        },
        {
            "hash": "478d3fafa7db4eb98286626684b939572cf3c3651173dbc31bf56be29f436c27",
            "hashType": "sha256",
            "name": "drand-beacon.json"
        },
        {
            "hash": "8a07b05139dc541cb41ba1800ccb75123339f99524c4e6e797e0c05683fd335d",
            "hashType": "sha256",
            "name": "entropy_previous.json"
        },
        {
            "hash": "638d71ae1c9009b264bd35bb44ff3c514bcd27f93654f4205b6dc867602a8085",
            "hashType": "sha256",
            "name": "ethereum.json"
        },
        {
            "hash": "df3788dd3f6a99cd48aa608317098e4d8de82241b68b16bad89a2ae5151ecbef",
            "hashType": "sha256",
            "name": "hacker-news.json"
        },
        {
            "hash": "c78d38f7bd47b0e68b4a9b0270867d3d84f094a937155b875dc47837ca271f01",
            "hashType": "sha256",
            "name": "nist-beacon.json"
        },
        {
            "hash": "f46d07595d998360dce77320de0c22ac6f15a8caab63da0307d02a0086f7a139",
            "hashType": "sha256",
            "name": "stellar.json"
        },
        {
            "hash": "940c0eae0a197fab83fe7ab917168b8b75e3f643bcc17c3b483c291430b7f60f",
            "hashType": "sha256",
            "name": "timestamp.json"
        },
        {
            "hash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
            "hashType": "sha256",
            "name": "user-entropy.json"
        }
    ],
    "hash": "5a46ea6ddaf8c6c5ba74f1faec0b1ff741b2c25bff85a9d87967cf902eb24e1d",
    "hashIterations": 500000,
    "hashType": "sha256",
    "prevHash": "06e9f0b58b5791065519593f1c89a9ad0535fe5013a7a418c1d715f19c8baae1"
}
```

### Retrieve an entropy file stored in a specified Git commit ID

 The `id` value in the URL is required to be a hex encoded SHA1 Git commit value (20 bytes).

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

The index that maps an entropy `hash` to a specific Git commit ID is persisted to a file in the `index` directory of the repository and committed. The `hash` value in the URL is required to be a hex encoded SHA256 value (32 bytes).

`https://entropy.truestamp.com/hash/:hash`

```sh
$ http https://entropy.truestamp.com/hash/7c47473d33c55cae28fcd2e312551e31ec8752a734339802be29e5f85a02d876

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

## Publishing

Before publishing your code you need to edit `wrangler.toml` file and add your Cloudflare `account_id` - more information about configuring and publishing your code can be found [in the documentation](https://developers.cloudflare.com/workers/learning/getting-started#7-configure-your-project-for-deployment).

Once you are ready, you can publish your code by running the following command:

```sh
wrangler publish
```
