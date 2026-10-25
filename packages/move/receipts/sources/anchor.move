/// Receipts (RC1, ADR-0061): anchors a batch of picks on Sui.
///
/// A batch is the Merkle root of the picks logged since the last anchor. The event carries the root,
/// how many picks it covers and the chain's clock, so `/verify` can prove that a pick existed before
/// its event locked. Nobody can add a pick to a batch after the fact, and nobody can take one out.
///
/// There's no object to version: the event carries `version` instead, so a verifier knows which
/// layout it's reading after an upgrade.
module receipts::anchor;

use sui::clock::Clock;
use sui::event;

/// Bumped on every upgrade that changes the event's meaning.
const VERSION: u64 = 1;
/// The root is a sha256 digest.
const ROOT_LENGTH: u64 = 32;

#[error(code = 1)]
const EBadRoot: vector<u8> = "Root must be a 32-byte sha256 digest";
#[error(code = 2)]
const EEmptyBatch: vector<u8> = "A batch anchors at least one pick";

public struct Anchored has copy, drop {
    root: vector<u8>,
    count: u64,
    ts_ms: u64,
    sender: address,
    version: u64,
}

/// Anyone may anchor: the root proves nothing until a verifier recomputes it from the picks.
public fun anchor(root: vector<u8>, count: u64, clock: &Clock, ctx: &TxContext) {
    assert!(root.length() == ROOT_LENGTH, EBadRoot);
    assert!(count > 0, EEmptyBatch);
    event::emit(Anchored {
        root,
        count,
        ts_ms: clock.timestamp_ms(),
        sender: ctx.sender(),
        version: VERSION,
    });
}

#[test_only]
public fun new_anchored_for_testing(
    root: vector<u8>,
    count: u64,
    ts_ms: u64,
    sender: address,
): Anchored {
    Anchored { root, count, ts_ms, sender, version: VERSION }
}
