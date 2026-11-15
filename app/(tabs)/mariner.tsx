import { Redirect } from 'expo-router';

export default function MarinerLink() {
  return <Redirect href={{ pathname: '/maps', params: { view: 'mariner' } }} />;
}
