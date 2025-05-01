# Steps to run

Firstly prepare all parts of dapp-evm by installing dependencies and building
```bash
yarn # install base dependencies
yarn deps # install dependencies in subdirectories
yarn build # build items in subdirectories 
```

Secondly start the environment
```bash
yarn local-env:start # start agoric and axelar chains
yarn deploy-contracts # deploy contracts on agoric
```

Next start the UI for use
```bash
yarn start:ui
```

Next start the relayer. this will boot up an ethereum chain and start relaying between Agoric <=> EVM using Axelar
```bash
yarn local-env:relay
```