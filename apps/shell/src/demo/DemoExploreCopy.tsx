/** Longer explainer below the guided live demo — intentionally past the first viewport. */

export function DemoExploreCopy() {
  return (
    <section className="demo-explore" aria-label="About this demo">
      <article className="demo-explore-block">
        <p className="demo-explore-kicker">In plain terms</p>
        <h2 className="demo-explore-title">This isn’t a chat app with a fancy skin</h2>
        <div className="demo-explore-body">
          <p>
            What you just walked through is two people — Alice and Bob — each with an agent that
            works for them. You asked Alice’s agent for a meeting. It didn’t dump you into a form
            on someone else’s website. It asked what it needed, then built a little interface
            right in the conversation so you could pick a time and send it.
          </p>
          <p>
            Bob never had to open Alice’s calendar app. His agent received the request from hers,
            built its own confirmation UI in his chat, and waited for him to accept or decline.
            The “Activity” strips are the paper trail of that agent-to-agent handoff — not you
            copy-pasting links, not a shared Google Doc, not another inbox to check.
          </p>
          <p>
            That’s the idea: you talk in ordinary language; your agent does the coordinating;
            when something needs your judgment, you get a clear control in a place you already
            trust. Imagine the same pattern for a table at a restaurant, a delivery slot, a
            school pickup swap, or a quote from a local business — each side’s agent handles the
            back-and-forth, and you only step in when it matters.
          </p>
          <p>
            We’re still early. This demo is a simple Level&nbsp;1 slice: one task, one composed
            component, one confirmation. The path from here is more of those moments stitched
            into everyday life — less tab-hopping, more “my agent already sorted it, tap to
            confirm.”
          </p>
        </div>
      </article>

      <article className="demo-explore-block demo-explore-block--tech">
        <p className="demo-explore-kicker">
          Under the hood (Same as above but for the tech bros)
        </p>
        <h2 className="demo-explore-title">A2A, MLS, and agent-composed UI</h2>
        <div className="demo-explore-body">
          <p>
            On the wire, Alice’s and Bob’s agents speak agent-to-agent (A2A): structured objects
            for the scheduling proposal and response, not scraped HTML. Delivery rides Atom’s
            agent fabric; sessions can sit on MLS (Messaging Layer Security) so the channel is
            end-to-end protected rather than “trust the platform’s database forever.”
          </p>
          <p>
            The meeting picker and confirm UI aren’t hardcoded screens in this page. Each agent
            emits a composition that references registry modules (
            <code>scheduling/meeting-picker</code>, <code>scheduling/meeting-confirm</code>
            ). The shell resolves those bundles, integrity-checks them, and embeds them in the
            conversation — the same GenUI path a production Atom agent uses when it needs real
            controls instead of markdown.
          </p>
          <p>
            What you approve lands in shell chrome and Activity as consequential outcomes, with
            the kind of audit trail you’d want before payments, calendar writes, or data shares
            grow teeth. Scale that model out and you get interoperable business agents, personal
            agents that negotiate on your behalf, and UI that appears only when the protocol
            needs a human in the loop — not another siloed chatbot per vendor.
          </p>
          <p>
            This demo keeps the surface small on purpose. The stack underneath is built so those
            next steps — richer modules, longer-running A2A workflows, MLS-backed rooms, and
            stricter attestation on high-stakes actions — plug into the same shell you’re looking
            at now.
          </p>
        </div>
      </article>
    </section>
  );
}
