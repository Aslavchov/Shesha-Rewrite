//! Runs the shared cases in `fixtures/document-rules.json` against the
//! server's validation. The designer's tests run the same file against its
//! own copy of these rules (`web/src/designer/model/rules.ts`), so the two
//! cannot drift apart (ADR 0008).

use serde_json::Value;
use server::forms::validate::validate;

#[test]
fn every_shared_case_gets_the_problems_it_lists() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/document-rules.json")).unwrap();
    let cases = fixture["cases"].as_array().unwrap();
    assert!(cases.len() > 50, "the fixture has lost its cases");

    for case in cases {
        let name = case["name"].as_str().unwrap();
        // The paths of the problems, in any order. Empty when the document is valid.
        let mut expected: Vec<String> = case["problems"]
            .as_array()
            .unwrap()
            .iter()
            .map(|path| path.as_str().unwrap().to_owned())
            .collect();
        let mut found: Vec<String> = match validate(&case["document"]) {
            Ok(_) => Vec::new(),
            Err(details) => details.into_iter().map(|detail| detail.path).collect(),
        };
        found.sort();
        expected.sort();
        assert_eq!(found, expected, "case: {name}");
    }
}
