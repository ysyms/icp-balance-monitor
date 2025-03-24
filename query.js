import { Ed25519KeyIdentity } from '@dfinity/identity';
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';

// 从命令行参数获取 canister ID 和 account owner
const TARGET_CANISTER_ID = Principal.fromText(process.argv[2]); // node query.js <canister_id> <account_owner>
const ACCOUNT_OWNER = Principal.fromText(process.argv[3]);

const icrc1Idl = ({ IDL }) => IDL.Service({
  icrc1_balance_of: IDL.Func(
    [IDL.Record({
      owner: IDL.Principal,
      subaccount: IDL.Opt(IDL.Vec(IDL.Nat8))
    })],
    [IDL.Nat],
    ['query']
  )
});

async function main() {
  try {
    const identity = Ed25519KeyIdentity.generate();
    const agent = await HttpAgent.create({
      host: 'https://icp0.io',
      identity,
      shouldFetchRootKey: false
    });

    const actor = Actor.createActor(icrc1Idl, {
      agent,
      canisterId: TARGET_CANISTER_ID
    });

    const balance = await actor.icrc1_balance_of({
      owner: ACCOUNT_OWNER,
      subaccount: []
    });

    console.log(JSON.stringify({
      status: "success",
      canister: TARGET_CANISTER_ID.toText(),
      address: ACCOUNT_OWNER.toText(),
      balance: balance.toString(),
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      status: "error",
      canister: TARGET_CANISTER_ID.toText(),
      address: ACCOUNT_OWNER.toText(),
      code: error.rejectCode || -1,
      message: error.message.split('\n')[0]
    }));
    process.exit(1);
  }
}

main();