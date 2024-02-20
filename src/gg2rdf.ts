/* NOTES
- only functions named `make...` output turtle as a side-effect.
- all output is to be handled by `output(...)` or `outputProperties`.
  This function should not be assumed to run synchronous,
  and all data passed to it should still be valid under reordering of calls.
- before replacing xslt, we should make a test run and compare the rdf for differences.
  Thus the initial goal should be to match xslt 1:1,
  only incorporating improvements after we have confirmed that it is equivalent.
*/

import { DOMParser } from "https://esm.sh/linkedom@0.16.8";
import { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
import { parseArgs } from "https://deno.land/std@0.215.0/cli/parse_args.ts";

const flags = parseArgs(Deno.args, {
  string: ["input", "output"],
  alias: { i: "input", o: "output" },
});

if (!flags.input) throw new Error("No input file provided");
if (!flags.output) flags.output = flags.input + ".ttl";

const document = new DOMParser().parseFromString(
  Deno.readTextFileSync(flags.input).replaceAll(/(<\/?)mods:/g, "$1MODS"),
  "text/xml",
);

Deno.writeTextFileSync(flags.output!, ""); // clear prexisting file

output(`@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix bibo: <http://purl.org/ontology/bibo/> .
@prefix cito: <http://purl.org/spar/cito/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix dwc: <http://rs.tdwg.org/dwc/terms/> .
@prefix dwcFP: <http://filteredpush.org/ontologies/oa/dwcFP#> .
@prefix fabio: <http://purl.org/spar/fabio/> .
@prefix trt: <http://plazi.org/vocab/treatment#> .
@prefix treatment: <http://treatment.plazi.org/id/> .
@prefix taxonName: <http://taxon-name.plazi.org/id/> .
@prefix taxonConcept: <http://taxon-concept.plazi.org/id/> .
@prefix xlink: <http://www.w3.org/1999/xlink/> .
`);

// this is the <document> surrounding everything. doc != document
const doc = document.querySelector("document") as Element;
const id = doc.getAttribute("docId");
console.log("document id :", id);

try {
  checkForErrors();
  makeTreatment();
} catch (error) {
  console.error("" + error);
  output(
    "# There was some Error in gg2rdf\n" +
      ("# " + error).replace(/\n/g, "\n# "),
  );
}

// end of top-level code

/** replaces <xsl:template match="/"> (root template) */
function checkForErrors() {
  const errors: string[] = [];
  const taxon: Element | undefined = document.querySelector(
    'document treatment subSubSection[type="nomenclature"] taxonomicName',
  );
  if (!taxon) {
    errors.push("the treatment is lacking the taxon");
  } else {
    const rank = taxon.getAttribute("rank");
    if (!rank) errors.push("the treatment taxon is lacking its rank attribute");
    const sigEpithet = normalizeSpace(taxon.getAttribute(rank)); // get the attribute with the rank as the name
    if (sigEpithet.match(/[^a-zA-Z\-]/)) {
      errors.push(`sigEpithet '${sigEpithet}' contains invalid characters`);
    }
    if (
      (rank === "subSpecies" || rank === "variety") &&
      normalizeSpace(taxon.getAttribute("species")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `species '${
          normalizeSpace(taxon.getAttribute("species"))
        }' contains invalid characters`,
      );
    }
    if (
      (rank === "subGenus" || rank === "species" || rank === "subSpecies" ||
        rank === "variety") &&
      normalizeSpace(taxon.getAttribute("genus")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `genus '${
          normalizeSpace(taxon.getAttribute("genus"))
        }' contains invalid characters`,
      );
    }
    if (
      (rank === "subFamily" || rank === "tribe" || rank === "subTribe") &&
      normalizeSpace(taxon.getAttribute("family")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `family '${
          normalizeSpace(taxon.getAttribute("family"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subOrder" &&
      normalizeSpace(taxon.getAttribute("order")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `order '${
          normalizeSpace(taxon.getAttribute("order"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subClass" &&
      normalizeSpace(taxon.getAttribute("class")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `class '${
          normalizeSpace(taxon.getAttribute("class"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subPhylum" &&
      normalizeSpace(taxon.getAttribute("phylum")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `phylum '${
          normalizeSpace(taxon.getAttribute("phylum"))
        }' contains invalid characters`,
      );
    }
    if (!taxon.getAttribute("kingdom")) {
      console.warn(
        "Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
      output(
        "# Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
    }
  }
  if (errors.length) {
    throw new Error(
      "Cannot produce RDF XML due to data errors:\n - " + errors.join("\n - "),
    );
  }
}

/** outputs turtle describing the treatment
 *
 * replaces <xsl:template match="document"> and <xsl:template match="treatment"> (incomplete)
 */
function makeTreatment() {
  // lines of turtle properties `pred obj`
  // subject and delimiters are added at the end.
  const properties: string[] = [];

  const taxon: Element = document.querySelector(
    'document treatment subSubSection[type="nomenclature"] taxonomicName',
  ); // existence asserted by checkForErrors
  const rank: string = taxon.getAttribute("rank");
  const taxonStatus: string = taxon.getAttribute("status") ??
    taxon.parentNode.querySelector(
      `taxonomicName ~ taxonomicNameLabel[rank="${rank}"]`,
    )?.innerText ?? "ABSENT";

  const taxonAuthority = getAuthority({ taxonName: taxon, taxonStatus });

  // add reference to subject taxon concept, using taxon name as a fallback if we're lacking a valid authority
  if (taxonAuthority === "INVALID") {
    // no valid authority given, fall back to taxon name
    properties.push(
      `trt:treatsTaxonName <${
        taxonNameBaseURI({ kingdom: taxon.getAttribute("kingdom") })
      }/${taxonNameForURI({ taxonName: taxon })}>`,
    );
  } else {
    // we have a valid authority, go for the taxon stringconcept
    if (
      taxonStatus !== "ABSENT" ||
      taxon.parentNode.querySelector(`taxonomicName ~ taxonomicNameLabel`)
    ) {
      properties.push(
        `trt:definesTaxonConcept <${
          taxonConceptURI({ taxonName: taxon, taxonAuthority })
        }>`,
      );
    } else {
      properties.push(
        `trt:augmentsTaxonConcept <${
          taxonConceptURI({ taxonName: taxon, taxonAuthority })
        }>`,
      );
    }
  }

  // TODO: continue from <!-- add authors (_might_ differ from article author ...) -->

  properties.push(`dc:creator ${getAuthors()}`);
  properties.push(`a trt:Treatment`);

  outputProperties(`treatment:${id}`, properties);
}

/** replaces <xsl:call-template name="authority"> */
function getAuthority(
  { taxonName, taxonStatus }: { taxonName: Element; taxonStatus: string },
) {
  const baseAuthorityName: string = taxonName.getAttribute("baseAuthorityName");
  const baseAuthorityYear: string = taxonName.getAttribute("baseAuthorityYear");
  const authorityName: string = taxonName.getAttribute("authorityName");
  const authorityYear: string = taxonName.getAttribute("authorityYear");
  const docAuthor: string = doc.getAttribute("docAuthor");
  const docDate: string = doc.getAttribute("docDate");
  if (taxonStatus.includes("ABSENT")) {
    // no status at all, use whichever authority given (basionym authority first, as it tends to be cited for a reason under ICZN code)
    if (baseAuthorityName && baseAuthorityYear) {
      return `_${
        authorityNameForURI({ authorityName: baseAuthorityName })
      }_${baseAuthorityYear}`;
    } else if (authorityName && authorityYear) {
      return `_${authorityNameForURI({ authorityName })}_${authorityYear}`;
    } else return "INVALID";
  } else if (taxonStatus.includes("nom") || taxonStatus.includes("name")) {
    // newly minted replacement name for homonym or Latin grammar error, use combination or document authority
    return `_${
      authorityNameForURI({
        authorityName: authorityName ?? docAuthor,
      })
    }_${docDate}`;
  } else if (taxonStatus.includes("comb") || taxonStatus.includes("stat")) {
    // new combination or status of existing epithet, use basionym authority (as that is what will be the most cited under ICZN code)
    if (baseAuthorityName && baseAuthorityYear) {
      return `_${
        authorityNameForURI({ authorityName: baseAuthorityName })
      }_${baseAuthorityYear}`;
    } else return "INVALID";
  } else {
    // newly minted taxon name, use document metadata if explicit attributes missing
    return `_${
      authorityNameForURI({ authorityName: authorityName || docAuthor })
    }_${authorityYear || docDate}`;
  }
}

/** replaces <xsl:call-template name="authorityNameForURI"> */
function authorityNameForURI({ authorityName }: { authorityName: string }) {
  authorityName = substringAfter(authorityName, ") ");
  authorityName = substringAfter(authorityName, ")");
  authorityName = substringAfter(authorityName, "] ");
  authorityName = substringAfter(authorityName, "]");
  authorityName = substringBefore(authorityName, " & ");
  authorityName = substringBefore(authorityName, " et al");
  authorityName = substringBefore(authorityName, " , ");
  authorityName = substringAfter(authorityName, " . ");
  authorityName = substringAfter(authorityName, " ");
  return encodeURIComponent(normalizeSpace(authorityName));
}

/** replaces <xsl:call-template name="taxonNameBaseURI"> */
function taxonNameBaseURI({ kingdom }: { kingdom: string }) {
  return `http://taxon-name.plazi.org/id/${
    kingdom ? encodeURIComponent(kingdom.replaceAll(" ", "_")) : "Animalia"
  }`;
}

/** replaces <xsl:call-template name="taxonNameForURI"> */
function taxonNameForURI(
  { taxonName }: { taxonName: Element | string },
) {
  if (typeof taxonName === "string") {
    if (
      taxonName.includes(",") &&
      !normalizeSpace(substringBefore(taxonName, ",")).includes(" ")
    ) {
      return normalizeSpace(substringBefore(taxonName, ",")).replaceAll(
        " ",
        "_",
      );
    } else {
      return normalizeSpace(substringBefore(taxonName, " ")).replaceAll(
        " ",
        "_",
      );
    }
  } else if (taxonName.getAttribute("genus")) {
    const names: string[] = [
      taxonName.getAttribute("genus"),
      taxonName.getAttribute("subGenus"),
      taxonName.getAttribute("species"),
      taxonName.getAttribute("variety") || taxonName.getAttribute("subSpecies"),
    ];
    // the variety || subSpecies is due to a quirk of the xslt
    // after replacement, this should proably be modified to put both if avaliable
    return names.filter((n) => !!n).map(normalizeSpace).map((n) =>
      n.replaceAll(" ", "_")
    ).join("_");
  }
  return "";
}

/** replaces <xsl:call-template name="taxonConceptBaseURI"> */
function taxonConceptBaseURI({ kingdom }: { kingdom: string }) {
  return `http://taxon-concept.plazi.org/id/${
    kingdom ? encodeURIComponent(kingdom.replaceAll(" ", "_")) : "Animalia"
  }`;
}

/** replaces <xsl:call-template name="taxonConceptURI"> */
function taxonConceptURI(
  { taxonName, taxonAuthority }: { taxonName: Element; taxonAuthority: string },
) {
  return `${
    taxonConceptBaseURI({ kingdom: taxonName.getAttribute("kingdom") })
  }/${taxonNameForURI({ taxonName })}${
    encodeURIComponent(normalizeSpace(taxonAuthority))
  }`;
}

/** → turtle snippet a la `"author1", "author2", ... "authorN"` */
function getAuthors() {
  const docAuthor = (doc.getAttribute("docAuthor") as string).split(/;|,|&|and/)
    .map((a) => STR(a.trim())).join(", ");
  // to keep author ordering (after xslt replaced):
  // const docAuthor = STR(doc.getAttribute("docAuthor"))

  const mods = document.getElementsByTagName(
    "MODSname",
  );
  const modsAuthor = mods.filter((m) =>
    m.querySelector("MODSroleTerm").innerText.match(/author/i)
  ).map((m) =>
    STR((m.querySelector("MODSnamePart").innerText as string).trim())
  ).join(", ");
  // to keep author ordering (after xslt replaced):
  // const modsAuthor = STR(mods.filter((m) => m.querySelector("MODSroleTerm").innerText.match(/author/i)).map((m) => (m.querySelector("MODSnamePart").innerText as string).trim()).join("; "));

  if (modsAuthor) return modsAuthor;
  else if (docAuthor) return docAuthor;
  else console.error("can't determine treatment authors");
}

function STR(s: string) {
  return `"${s.replace(/"/g, `\\"`).replace(/\n/g, "\\n")}"`;
}

/** returns the part of s before c, not including c
 * and returns s if s does not contain c. */
function substringBefore(s: string, c: string) {
  if (!s.includes(c)) return s;
  const index = s.indexOf(c);
  return s.substring(0, index);
}
/** returns the part of s after c, not including c
 * and returns s if s does not contain c. */
function substringAfter(s: string, c: string) {
  if (!s.includes(c)) return s;
  const index = s.indexOf(c) + c.length;
  return s.substring(index);
}

function normalizeSpace(s: string) {
  // deno-lint-ignore no-control-regex
  return s.replace(/(\x20|\x09|\x0A|\x0D)+/, " ").trim();
}

/** this function should only be called with valid turtle segments,
 * i.e. full triples, always ending with `.` */
function output(data: string) {
  Deno.writeTextFileSync(flags.output!, data + "\n", { append: true });
}

/** the second argument is a list of `predicate object` strings;
 * without delimiters (";" or ".")
 */
function outputProperties(subject: string, properties: string[]) {
  output(subject + "\n  " + properties.join(" ;\n  ") + " .");
}