# HMR Add Container Test

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
  import Hello from '../components/react/Hello.tsx';
</script>

<HelloWorld uniqueid="existing-container" />
<Hello client:only uniqueid="new-container-1" />
<Hello ssr:only uniqueid="new-container-2" />
