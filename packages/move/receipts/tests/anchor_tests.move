#[test_only]
module receipts::anchor_tests;

use receipts::anchor::{Self, Anchored};
use sui::clock;
use sui::event;
use sui::test_scenario as ts;

const KEEPER: address = @0xA;

fun root(): vector<u8> {
    x"8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"
}

#[test]
fun anchor_emits_the_root_count_and_clock() {
    let mut scenario = ts::begin(KEEPER);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1_792_800_000_000);
    anchor::anchor(root(), 3, &clock, scenario.ctx());
    let events = event::events_by_type<Anchored>();
    assert!(events.length() == 1);
    assert!(events[0] == anchor::new_anchored_for_testing(root(), 3, 1_792_800_000_000, KEEPER));
    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun two_batches_emit_two_events() {
    let mut scenario = ts::begin(KEEPER);
    let clock = clock::create_for_testing(scenario.ctx());
    anchor::anchor(root(), 1, &clock, scenario.ctx());
    anchor::anchor(root(), 2, &clock, scenario.ctx());
    assert!(event::events_by_type<Anchored>().length() == 2);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure(abort_code = anchor::EBadRoot)]
fun a_short_root_aborts() {
    let mut scenario = ts::begin(KEEPER);
    let clock = clock::create_for_testing(scenario.ctx());
    anchor::anchor(x"0102", 1, &clock, scenario.ctx());
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure(abort_code = anchor::EEmptyBatch)]
fun an_empty_batch_aborts() {
    let mut scenario = ts::begin(KEEPER);
    let clock = clock::create_for_testing(scenario.ctx());
    anchor::anchor(root(), 0, &clock, scenario.ctx());
    clock.destroy_for_testing();
    scenario.end();
}
