### Cross-Chain DeFi Yield Optimizer: Agoric-Axelar-Ethereum Architecture



```mermaid
graph TD
    %% Define main sections
    subgraph UI["User Interface Layer"]
        Frontend["React Frontend + Keplr + CosmJS"]
    end

    subgraph Agoric["Agoric Chain"]
        YieldOptimizerContract["Yield Optimizer Contract"]
        RateAuthority["Rate Authority (APY Oracles)"]

        %% Strategy Pools (with multiple targets and delta T)
        Pool1["Pool 1: Multi-target (e.g., USDC, DAI, USDT on Aave ETH and Compound ETH) | ΔT: 60 mins"]
        Pool2["Pool 2: Multi-target (e.g., USDC on Aave Base, Aave Arbitrum, Aave Base) | ΔT: 3 hours"]
        PoolN["Pool N: Custom targets and ΔT"]

        subgraph AccountKits["User Account Kits (Agoric VM)"]
            YieldAccountKit1["YieldAccountKit (Strat 1)"]
            EvmAccountKit1["EvmAccountKit (Strat 1)"]
            YieldAccountKit2["YieldAccountKit (Strat 2)"]
            EvmAccountKit2["EvmAccountKit (Strat 2)"]
            YieldAccountKitN["YieldAccountKit (Strat N)"]
            EvmAccountKitN["EvmAccountKit (Strat N)"]
        end
    end

    subgraph Axelar["Axelar Network (IBC/GMP)"]
        GMPRouter["GMP Message Router"]
    end

    subgraph Ethereum["Ethereum Network"]
        AxelarGateway["Axelar Gateway Contract"]
        SCAFactory["Smart Contract Account Factory"]
        SCA1["Smart Contract Account (Strat 1)"]
        SCA2["Smart Contract Account (Strat 2)"]
        SCAN["Smart Contract Account (Strat N)"]

        Aave["Aave Protocol"]
        Compound["Compound Protocol"]
    end

    subgraph Future["Future Networks"]
        Optimism["Optimism"]
        Arbitrum["Arbitrum"]
    end

    %% Define relationships
    Frontend <--> YieldOptimizerContract
    RateAuthority --> YieldOptimizerContract

    YieldOptimizerContract --> Pool1
    YieldOptimizerContract --> Pool2
    YieldOptimizerContract --> PoolN

    Pool1 --> YieldAccountKit1
    YieldAccountKit1 --> EvmAccountKit1
    EvmAccountKit1 --> GMPRouter

    Pool2 --> YieldAccountKit2
    YieldAccountKit2 --> EvmAccountKit2
    EvmAccountKit2 --> GMPRouter

    PoolN --> YieldAccountKitN
    YieldAccountKitN --> EvmAccountKitN
    EvmAccountKitN --> GMPRouter

    GMPRouter --> AxelarGateway
    AxelarGateway --> SCAFactory
    SCAFactory --> SCA1
    SCAFactory --> SCA2
    SCAFactory --> SCAN

    SCA1 --> Aave
    SCA1 --> Compound
    SCA2 --> Aave
    SCA2 --> Compound
    SCAN --> Aave
    SCAN --> Compound

    GMPRouter -.-> Optimism
    GMPRouter -.-> Arbitrum

    %% Add styles
    classDef agoricNode fill:#e6f7ff,stroke:#0066cc,color:#333
    classDef axelarNode fill:#fff2e6,stroke:#ff8c1a,color:#333
    classDef ethNode fill:#e6ffe6,stroke:#009933,color:#333
    classDef uiNode fill:#f0e6ff,stroke:#6600cc,color:#333
    classDef futureNode fill:#f9f9f9,stroke:#666,stroke-dasharray: 5 5,color:#666

    class YieldOptimizerContract,RateAuthority,Pool1,Pool2,PoolN,YieldAccountKit1,YieldAccountKit2,YieldAccountKitN,EvmAccountKit1,EvmAccountKit2,EvmAccountKitN,AccountKits agoricNode
    class GMPRouter,AxelarGateway axelarNode
    class SCAFactory,SCA1,SCA2,SCAN,Aave,Compound ethNode
    class Frontend uiNode
    class Optimism,Arbitrum,Future futureNode
```
