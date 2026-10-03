#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { doctor } from "../runtime/doctor.js";
import { injectEntries } from "../runtime/inject-entries.js";
import { openEntry } from "../runtime/open-entry.js";
interface CliDependencies {
    readFileImpl?: typeof readFile;
    openEntryImpl?: typeof openEntry;
    injectEntriesImpl?: typeof injectEntries;
    doctorImpl?: typeof doctor;
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
}
export declare function runCli(argv: string[], dependencies?: CliDependencies): Promise<number>;
export {};
