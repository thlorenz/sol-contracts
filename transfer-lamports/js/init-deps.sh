#!/usr/bin/env sh

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"


yarn add -D               \
    @tsconfig/recommended \
    @types/node           \
    @types/debug          \
    prettier              \
    tape                  \
    @types/tape           \
    tslib                 \
    typescript 

yarn add            \
    borsh           \
    debug           \
    supports-color  \
    @solana/web3.js 

mkdir -p $DIR/src && \
( cd $DIR/src && ln -s ../../../sol-common/js/src/sol-common.ts)
