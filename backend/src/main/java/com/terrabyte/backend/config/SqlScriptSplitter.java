package com.terrabyte.backend.config;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits a SQL script into individual statements.
 *
 * <p>This exists because {@code sqlite-jdbc}'s {@code Statement.execute(String)}
 * runs only the <em>first</em> statement of a multi-statement script and
 * discards the rest <strong>without raising anything</strong>. Handing it the
 * whole schema therefore executed {@code PRAGMA foreign_keys = ON;} and silently
 * dropped the remaining 51 KB, so the application logged "applying full schema"
 * and then failed verification against an empty database. Verified against
 * sqlite-jdbc 3.45.2.0:
 *
 * <pre>
 *   execute("CREATE TABLE one(x); CREATE TABLE two(y); CREATE TABLE three(z);")
 *   -&gt; sqlite_master contains only [one]
 * </pre>
 *
 * <p>A plain split on {@code ;} is not enough, and every reason is present in
 * this repository's SQL:
 *
 * <ul>
 *   <li><b>Trigger bodies.</b> {@code CREATE TRIGGER … BEGIN … END;} contains
 *       statement separators. The schema has ten such triggers.
 *   <li><b>CASE inside a trigger body.</b> The guard triggers are written as
 *       {@code BEGIN SELECT CASE WHEN … THEN RAISE(ABORT,'…') END; END;} — the
 *       first {@code END} closes the CASE, not the body. Counting {@code CASE}
 *       is what tells the two apart.
 *   <li><b>Transactions.</b> The migrations open with {@code BEGIN IMMEDIATE;},
 *       a complete statement rather than a block opener. Treating every
 *       {@code BEGIN} as a block would swallow a whole migration into one
 *       fragment that never closes.
 * </ul>
 *
 * <p>String literals and comments are tracked so a separator inside them is not
 * mistaken for the end of a statement. Neither carries a semicolon in today's
 * SQL, but a splitter that only works on the input it was written against is a
 * trap for whoever adds the next migration.
 */
final class SqlScriptSplitter {

    private SqlScriptSplitter() {
    }

    static List<String> split(String script) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        StringBuilder word = new StringBuilder();

        boolean inString = false;
        boolean inLineComment = false;
        boolean inBlockComment = false;
        boolean inTriggerBody = false;
        int caseDepth = 0;

        int index = 0;
        while (index < script.length()) {
            char character = script.charAt(index);
            char next = index + 1 < script.length() ? script.charAt(index + 1) : '\0';

            if (inLineComment) {
                current.append(character);
                if (character == '\n') {
                    inLineComment = false;
                }
                index++;
                continue;
            }
            if (inBlockComment) {
                current.append(character);
                if (character == '*' && next == '/') {
                    current.append(next);
                    index += 2;
                    inBlockComment = false;
                    continue;
                }
                index++;
                continue;
            }
            if (inString) {
                current.append(character);
                if (character == '\'') {
                    if (next == '\'') {
                        // '' is an escaped quote, not the end of the literal.
                        current.append(next);
                        index += 2;
                        continue;
                    }
                    inString = false;
                }
                index++;
                continue;
            }

            if (character == '-' && next == '-') {
                current.append(character).append(next);
                index += 2;
                inLineComment = true;
                continue;
            }
            if (character == '/' && next == '*') {
                current.append(character).append(next);
                index += 2;
                inBlockComment = true;
                continue;
            }
            if (character == '\'') {
                current.append(character);
                index++;
                inString = true;
                continue;
            }

            if (isWordCharacter(character)) {
                word.append(character);
                current.append(character);
                index++;
                continue;
            }

            // A non-word character closes whatever word preceded it. Keywords
            // are only meaningful as whole words, so this is where they are read.
            boolean closesTriggerBody = false;
            if (word.length() > 0) {
                String keyword = word.toString();
                word.setLength(0);
                if (inTriggerBody) {
                    if (keyword.equalsIgnoreCase("CASE")) {
                        caseDepth++;
                    } else if (keyword.equalsIgnoreCase("END")) {
                        if (caseDepth > 0) {
                            caseDepth--;
                        } else {
                            closesTriggerBody = true;
                        }
                    }
                } else if (keyword.equalsIgnoreCase("BEGIN")
                        && startsTrigger(current.toString())) {
                    inTriggerBody = true;
                    caseDepth = 0;
                }
            }

            current.append(character);
            if (character == ';') {
                if (!inTriggerBody) {
                    flush(statements, current);
                } else if (closesTriggerBody) {
                    inTriggerBody = false;
                    flush(statements, current);
                }
            }
            index++;
        }

        flush(statements, current);
        return statements;
    }

    /**
     * Whether the statement being accumulated is a CREATE TRIGGER.
     *
     * <p>Keyed on this rather than on BEGIN alone, so {@code BEGIN IMMEDIATE;}
     * at the top of a migration stays a statement of its own.
     */
    private static boolean startsTrigger(String current) {
        return stripped(current).toUpperCase().startsWith("CREATE TRIGGER");
    }

    private static boolean isWordCharacter(char character) {
        return Character.isLetterOrDigit(character) || character == '_';
    }

    /** The text with leading comments and whitespace removed. */
    private static String stripped(String text) {
        int index = 0;
        while (index < text.length()) {
            char character = text.charAt(index);
            if (Character.isWhitespace(character)) {
                index++;
            } else if (character == '-' && index + 1 < text.length()
                    && text.charAt(index + 1) == '-') {
                int newline = text.indexOf('\n', index);
                if (newline < 0) {
                    return "";
                }
                index = newline + 1;
            } else {
                break;
            }
        }
        return text.substring(index);
    }

    private static void flush(List<String> statements, StringBuilder current) {
        String statement = stripped(current.toString()).trim();
        current.setLength(0);
        // A file that ends in comments, or a stray separator, produces nothing
        // worth sending to the driver.
        if (!statement.isEmpty() && !statement.equals(";")) {
            statements.add(statement);
        }
    }
}
