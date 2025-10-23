# HMR Remove Unused Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<span class="modified-content-case1">Some modified content here.</span>

<HelloWorld client:only uniqueid="used-component" />
