.PHONY: build test lint format check sync-fixtures sync-fixtures-local dev-link-protos

SPEC_CONFORMANCE_DIR := ../multiagentcoordinationprotocol/schemas/conformance

build:
	npm run build

test:
	npm test

lint:
	npm run lint

format:
	npm run format

check: lint format build test

## Sync conformance fixtures from canonical source
sync-fixtures:
	@if [ ! -d "$(SPEC_CONFORMANCE_DIR)" ]; then \
		echo "Error: Spec repo not found at $(SPEC_CONFORMANCE_DIR)"; \
		exit 1; \
	fi
	@for f in $(SPEC_CONFORMANCE_DIR)/*.json; do \
		cp "$$f" tests/conformance/; \
		echo "  Copied $$(basename $$f)"; \
	done
	@echo "Done. Run 'git diff tests/conformance/' to review changes."

## Alias for sync-fixtures (same source)
sync-fixtures-local: sync-fixtures

## Link local proto package for development (test proto changes before publishing)
dev-link-protos:
	cd ../multiagentcoordinationprotocol/packages/proto-npm && npm link
	npm link @macp/proto
	@echo "Linked local @macp/proto. Run 'npm unlink @macp/proto' when done."
