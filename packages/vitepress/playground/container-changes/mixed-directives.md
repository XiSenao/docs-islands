# Container Changes Test - Mixed Directives

This page tests mixed render directives for the same component.

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld client:only uniqueId="client-only" />

---

<HelloWorld ssr:only uniqueId="ssr-only" />

---

<HelloWorld client:load uniqueId="client-load" />

---

<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />
<br />

<HelloWorld client:visible uniqueId="client-visible" />
